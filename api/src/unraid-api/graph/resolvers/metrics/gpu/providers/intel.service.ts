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

interface IntelGpuInfo {
    pciId: string;
    model: string;
}

interface IntelGpuTopEngineData {
    busy?: number;
    sema?: number;
    wait?: number;
    unit?: string;
}

interface IntelGpuTopSample {
    frequency?: { requested?: number; actual?: number; unit?: string };
    power?: { GPU?: number; Package?: number; unit?: string };
    engines?: Record<string, IntelGpuTopEngineData>;
    'imc-bandwidth'?: { reads?: number; writes?: number; unit?: string };
    rc6?: { value?: number; unit?: string };
}

@Injectable()
export class IntelGpuService implements GpuMonitoringProvider {
    readonly id = 'intel-gpu';
    private readonly logger = new Logger(IntelGpuService.name);

    async isAvailable(): Promise<boolean> {
        try {
            const entries = await readdir(DRM_PATH);

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
        const gpus = await this.detectIntelGpus();
        if (gpus.length === 0) return [];

        const readings: RawGpuReading[] = [];
        for (let i = 0; i < gpus.length; i++) {
            const reading = await this.collectSingleIntelGpu(gpus[i], i);
            if (reading) readings.push(reading);
        }
        return readings;
    }

    private async detectIntelGpus(): Promise<IntelGpuInfo[]> {
        const gpus: IntelGpuInfo[] = [];

        try {
            const { stdout } = await execFileAsync('lspci', ['-Dmm'], { timeout: 5000 });
            for (const line of stdout.split('\n')) {
                if (
                    !(line.includes('VGA') || line.includes('Display')) ||
                    !line.includes('Intel Corporation')
                )
                    continue;

                const firstQuote = line.indexOf('"');
                const pciId = firstQuote > 0 ? line.substring(0, firstQuote).trim() : '';

                const quotedStrings = [...line.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
                let model = '';
                if (quotedStrings.length >= 3) {
                    const fullModel = quotedStrings[2];
                    const bracketStart = fullModel.indexOf('[');
                    const bracketEnd = fullModel.indexOf(']');
                    if (bracketStart !== -1 && bracketEnd > bracketStart) {
                        model = fullModel.substring(bracketStart + 1, bracketEnd).trim();
                    } else {
                        model = fullModel;
                    }
                }

                if (pciId && model) {
                    gpus.push({ pciId, model });
                }
            }
        } catch {
            const entries = await readdir(DRM_PATH).catch(() => [] as string[]);
            for (const entry of entries) {
                if (!entry.startsWith('card') || entry.includes('-')) continue;
                const vendorPath = join(DRM_PATH, entry, 'device', 'vendor');
                try {
                    const vendor = (await readFile(vendorPath, 'utf-8')).trim();
                    if (vendor !== '0x8086') continue;
                    const deviceId = (
                        await readFile(join(DRM_PATH, entry, 'device', 'device'), 'utf-8')
                    ).trim();
                    gpus.push({ pciId: entry, model: `Intel GPU (${deviceId})` });
                } catch {
                    continue;
                }
            }
        }

        return gpus;
    }

    private async collectSingleIntelGpu(
        gpu: IntelGpuInfo,
        index: number
    ): Promise<RawGpuReading | null> {
        const reading: RawGpuReading = {
            id: `intel-gpu-${index}`,
            name: `Intel ${gpu.model}`,
            vendor: GpuVendor.INTEL,
            pciBusId: gpu.pciId,
        };

        reading.driverVersion = await this.getDriverVersion();

        const cardEntry = await this.findCardEntry();
        if (cardEntry) {
            const devicePath = join(DRM_PATH, cardEntry, 'device');
            const coreFreq = await this.readSysfsValue(join(devicePath, 'gt_cur_freq_mhz'));
            if (coreFreq !== undefined) reading.coreClock = coreFreq;
        }

        await this.collectIntelGpuTopMetrics(reading);
        await this.collectTemperature(reading);

        return reading;
    }

    private async collectIntelGpuTopMetrics(reading: RawGpuReading): Promise<void> {
        let stdout = '';
        try {
            const result = await execFileAsync(
                'timeout',
                ['2', 'intel_gpu_top', '-J', '-s', '500', '-n', '1'],
                { timeout: 3000 }
            );
            stdout = result.stdout;
        } catch (err: unknown) {
            const execErr = err as { stdout?: string };
            if (execErr.stdout && execErr.stdout.length > 0) {
                stdout = execErr.stdout;
            } else {
                this.logger.debug('intel_gpu_top not available or timed out');
                return;
            }
        }

        const sample = this.parseIntelGpuTopJson(stdout);
        if (!sample) return;

        if (sample.engines) {
            let totalUtil = 0;
            let engineCount = 0;
            for (const engineData of Object.values(sample.engines)) {
                if (typeof engineData.busy === 'number') {
                    totalUtil += engineData.busy;
                    engineCount++;
                }
            }
            if (engineCount > 0) {
                reading.coreUtilization = Math.round((totalUtil / engineCount) * 100) / 100;
            }
        }

        if (sample.power?.GPU !== undefined) {
            reading.powerDraw = Math.round(sample.power.GPU * 1000) / 1000;
        }

        if (sample.frequency?.actual !== undefined && sample.frequency.actual > 0) {
            reading.coreClock = sample.frequency.actual;
        }
    }

    private parseIntelGpuTopJson(output: string): IntelGpuTopSample | null {
        const cleaned = output.replace(/\n/g, '').replace(/\t/g, '');
        const startIdx = cleaned.indexOf('{');
        if (startIdx === -1) return null;

        let braceCount = 0;
        let endIdx = -1;
        for (let i = startIdx; i < cleaned.length; i++) {
            if (cleaned[i] === '{') braceCount++;
            else if (cleaned[i] === '}') {
                braceCount--;
                if (braceCount === 0) {
                    endIdx = i + 1;
                    break;
                }
            }
        }

        if (endIdx === -1) return null;

        try {
            return JSON.parse(cleaned.substring(startIdx, endIdx)) as IntelGpuTopSample;
        } catch {
            return null;
        }
    }

    private async collectTemperature(reading: RawGpuReading): Promise<void> {
        const gpuTemp = await this.getIntelGpuTemp();
        if (gpuTemp !== undefined) {
            reading.temperatureCore = gpuTemp;
            return;
        }

        const cpuTemp = await this.getCpuTemp();
        if (cpuTemp !== undefined) {
            reading.temperatureCore = cpuTemp;
        }
    }

    private async getIntelGpuTemp(): Promise<number | undefined> {
        try {
            const entries = await readdir(DRM_PATH);
            for (const entry of entries) {
                if (!entry.startsWith('card') || entry.includes('-')) continue;
                try {
                    const hwmonDir = join(DRM_PATH, entry, 'device', 'hwmon');
                    const hwmons = await readdir(hwmonDir);
                    for (const hwmon of hwmons) {
                        const tempPath = join(hwmonDir, hwmon, 'temp1_input');
                        const value = (await readFile(tempPath, 'utf-8')).trim();
                        const milliC = Number.parseFloat(value);
                        if (Number.isFinite(milliC)) {
                            return Math.round((milliC / 1000) * 10) / 10;
                        }
                    }
                } catch {
                    continue;
                }
            }
        } catch {
            // no hwmon available
        }
        return undefined;
    }

    private async getCpuTemp(): Promise<number | undefined> {
        try {
            const hwmonBase = '/sys/class/hwmon';
            const hwmons = await readdir(hwmonBase);
            for (const hwmon of hwmons) {
                try {
                    const name = (await readFile(join(hwmonBase, hwmon, 'name'), 'utf-8')).trim();
                    if (name !== 'coretemp') continue;
                    const value = (
                        await readFile(join(hwmonBase, hwmon, 'temp1_input'), 'utf-8')
                    ).trim();
                    const milliC = Number.parseFloat(value);
                    if (Number.isFinite(milliC)) {
                        return Math.round((milliC / 1000) * 10) / 10;
                    }
                } catch {
                    continue;
                }
            }
        } catch {
            // no coretemp available
        }
        return undefined;
    }

    private async getDriverVersion(): Promise<string | undefined> {
        try {
            const { stdout } = await execFileAsync('modinfo', ['i915'], { timeout: 5000 });
            for (const line of stdout.split('\n')) {
                if (line.startsWith('vermagic:')) {
                    const parts = line.split(/\s+/);
                    if (parts.length >= 2) return parts[1];
                }
            }
            return undefined;
        } catch {
            return undefined;
        }
    }

    private async findCardEntry(): Promise<string | undefined> {
        try {
            const entries = await readdir(DRM_PATH);
            for (const entry of entries) {
                if (!entry.startsWith('card') || entry.includes('-')) continue;
                const vendorPath = join(DRM_PATH, entry, 'device', 'vendor');
                try {
                    const vendor = (await readFile(vendorPath, 'utf-8')).trim();
                    if (vendor === '0x8086') return entry;
                } catch {
                    continue;
                }
            }
        } catch {
            // not available
        }
        return undefined;
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
