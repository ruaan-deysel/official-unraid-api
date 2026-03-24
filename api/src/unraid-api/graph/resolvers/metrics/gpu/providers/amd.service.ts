import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';

import { GpuVendor } from '@app/unraid-api/graph/resolvers/metrics/gpu/gpu.model.js';
import {
    GpuMonitoringProvider,
    RawGpuReading,
} from '@app/unraid-api/graph/resolvers/metrics/gpu/providers/provider.interface.js';

const execFileAsync = promisify(execFile);

interface RocmGpuJson {
    card?: string;
    'GPU ID'?: string;
    'Unique ID'?: string;
    'GPU use (%)'?: string;
    'GPU memory use (%)'?: string;
    'GFX Activity'?: string;
    'Temperature (Sensor edge) (C)'?: string;
    'Temperature (Sensor junction) (C)'?: string;
    'Temperature (Sensor memory) (C)'?: string;
    'Current Socket Graphics Clock (MHz)'?: string;
    'Current Socket Memory Clock (MHz)'?: string;
    'Average Graphics Package Power (W)'?: string;
    'VRAM Total Memory (B)'?: string;
    'VRAM Total Used Memory (B)'?: string;
    'Fan speed (%)'?: string;
    'Card series'?: string;
    'Card model'?: string;
    'Card vendor'?: string;
    'Card SKU'?: string;
    'Driver version'?: string;
    'PCI Bus'?: string;
    'VBIOS version'?: string;
}

@Injectable()
export class AmdGpuService implements GpuMonitoringProvider {
    readonly id = 'rocm-smi';
    private readonly logger = new Logger(AmdGpuService.name);

    async isAvailable(): Promise<boolean> {
        try {
            await execFileAsync('rocm-smi', ['--version'], { timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }

    async readAll(): Promise<RawGpuReading[]> {
        try {
            const { stdout } = await execFileAsync('rocm-smi', ['--showallinfo', '--json'], {
                timeout: 10000,
            });

            return this.parseJsonOutput(stdout);
        } catch (err) {
            this.logger.error(`Failed to query rocm-smi: ${err}`);
            return [];
        }
    }

    private parseJsonOutput(output: string): RawGpuReading[] {
        try {
            const data = JSON.parse(output) as Record<string, RocmGpuJson>;
            const readings: RawGpuReading[] = [];

            for (const [key, gpu] of Object.entries(data)) {
                if (!key.startsWith('card')) continue;
                const index = readings.length;
                const name = gpu['Card model'] || gpu['Card series'] || `AMD GPU ${index}`;

                const vramTotal = this.parseBytesToMiB(gpu['VRAM Total Memory (B)']);
                const vramUsed = this.parseBytesToMiB(gpu['VRAM Total Used Memory (B)']);

                readings.push({
                    id: `amd-gpu-${index}`,
                    name,
                    vendor: GpuVendor.AMD,
                    pciBusId: gpu['PCI Bus'] || undefined,
                    driverVersion: gpu['Driver version'] || undefined,
                    vbiosVersion: gpu['VBIOS version'] || undefined,
                    coreUtilization: this.parseFloat(gpu['GPU use (%)'] ?? gpu['GFX Activity']),
                    memoryUtilization: this.parseFloat(gpu['GPU memory use (%)']),
                    coreClock: this.parseInt(gpu['Current Socket Graphics Clock (MHz)']),
                    memoryClock: this.parseInt(gpu['Current Socket Memory Clock (MHz)']),
                    powerDraw: this.parseFloat(gpu['Average Graphics Package Power (W)']),
                    fanSpeed: this.parseInt(gpu['Fan speed (%)']),
                    memoryTotal: vramTotal,
                    memoryUsed: vramUsed,
                    memoryFree:
                        vramTotal !== undefined && vramUsed !== undefined
                            ? vramTotal - vramUsed
                            : undefined,
                    temperatureCore: this.parseFloat(
                        gpu['Temperature (Sensor edge) (C)'] ?? gpu['Temperature (Sensor junction) (C)']
                    ),
                    temperatureMemory: this.parseFloat(gpu['Temperature (Sensor memory) (C)']),
                    temperatureHotspot: this.parseFloat(gpu['Temperature (Sensor junction) (C)']),
                });
            }

            return readings;
        } catch (err) {
            this.logger.error(`Failed to parse rocm-smi JSON output: ${err}`);
            return [];
        }
    }

    private parseFloat(value: string | undefined): number | undefined {
        if (!value || value === 'N/A') return undefined;
        const num = Number.parseFloat(value);
        return Number.isFinite(num) ? num : undefined;
    }

    private parseInt(value: string | undefined): number | undefined {
        if (!value || value === 'N/A') return undefined;
        const num = Number.parseInt(value, 10);
        return Number.isFinite(num) ? num : undefined;
    }

    private parseBytesToMiB(value: string | undefined): number | undefined {
        if (!value || value === 'N/A') return undefined;
        const bytes = Number.parseFloat(value);
        if (!Number.isFinite(bytes)) return undefined;
        return Math.round((bytes / (1024 * 1024)) * 100) / 100;
    }
}
