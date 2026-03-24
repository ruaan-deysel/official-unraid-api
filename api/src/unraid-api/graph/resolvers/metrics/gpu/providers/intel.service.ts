import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { promisify } from 'util';

import { GpuVendor } from '@app/unraid-api/graph/resolvers/metrics/gpu/gpu.model.js';
import {
    GpuMonitoringProvider,
    RawGpuReading,
} from '@app/unraid-api/graph/resolvers/metrics/gpu/providers/provider.interface.js';

const execFileAsync = promisify(execFile);

const DRM_PATH = '/sys/class/drm';

@Injectable()
export class IntelGpuService implements GpuMonitoringProvider {
    readonly id = 'intel-gpu';
    private readonly logger = new Logger(IntelGpuService.name);

    async isAvailable(): Promise<boolean> {
        try {
            const entries = await readdir(DRM_PATH);
            const hasIntelCard = entries.some((e) => e.startsWith('card'));
            if (!hasIntelCard) return false;

            for (const entry of entries) {
                if (!entry.startsWith('card') || entry.includes('-')) continue;
                const vendorPath = join(DRM_PATH, entry, 'device', 'vendor');
                try {
                    const vendor = (await readFile(vendorPath, 'utf-8')).trim();
                    if (vendor === '0x8086') return true;
                } catch {
                    continue;
                }
            }
            return false;
        } catch {
            return false;
        }
    }

    async readAll(): Promise<RawGpuReading[]> {
        const readings: RawGpuReading[] = [];

        try {
            const entries = await readdir(DRM_PATH);

            for (const entry of entries) {
                if (!entry.startsWith('card') || entry.includes('-')) continue;
                const vendorPath = join(DRM_PATH, entry, 'device', 'vendor');
                try {
                    const vendor = (await readFile(vendorPath, 'utf-8')).trim();
                    if (vendor !== '0x8086') continue;
                } catch {
                    continue;
                }

                const reading = await this.readIntelGpu(entry, readings.length);
                if (reading) readings.push(reading);
            }
        } catch (err) {
            this.logger.error(`Failed to read Intel GPU info: ${err}`);
        }

        return readings;
    }

    private async readIntelGpu(cardEntry: string, index: number): Promise<RawGpuReading | null> {
        const devicePath = join(DRM_PATH, cardEntry, 'device');

        const name = await this.getDeviceName(devicePath, index);
        const driverVersion = await this.getDriverVersion();

        const reading: RawGpuReading = {
            id: `intel-gpu-${index}`,
            name,
            vendor: GpuVendor.INTEL,
            driverVersion,
        };

        const coreFreq = await this.readSysfsValue(join(devicePath, 'gt_cur_freq_mhz'));
        if (coreFreq !== undefined) reading.coreClock = coreFreq;

        try {
            const { stdout } = await execFileAsync('intel_gpu_top', ['-l', '-s', '500', '-o', '-'], {
                timeout: 3000,
            });
            this.parseIntelGpuTop(stdout, reading);
        } catch {
            this.logger.debug('intel_gpu_top not available or timed out, using sysfs only');
        }

        return reading;
    }

    private parseIntelGpuTop(output: string, reading: RawGpuReading): void {
        const lines = output.trim().split('\n');
        if (lines.length < 2) return;

        const lastLine = lines[lines.length - 1];
        const fields = lastLine.split(/\s+/);

        if (fields.length >= 2) {
            const busy = Number.parseFloat(fields[1]);
            if (Number.isFinite(busy)) {
                reading.coreUtilization = busy;
            }
        }
    }

    private async getDeviceName(devicePath: string, index: number): Promise<string> {
        try {
            const deviceId = (await readFile(join(devicePath, 'device'), 'utf-8')).trim();
            return `Intel GPU ${index} (${deviceId})`;
        } catch {
            return `Intel GPU ${index}`;
        }
    }

    private async getDriverVersion(): Promise<string | undefined> {
        try {
            const { stdout } = await execFileAsync('modinfo', ['i915', '-F', 'version'], {
                timeout: 5000,
            });
            return stdout.trim() || undefined;
        } catch {
            return undefined;
        }
    }

    private async readSysfsValue(path: string): Promise<number | undefined> {
        try {
            const value = (await readFile(path, 'utf-8')).trim();
            const num = Number.parseInt(value, 10);
            return Number.isFinite(num) ? num : undefined;
        } catch {
            return undefined;
        }
    }
}
