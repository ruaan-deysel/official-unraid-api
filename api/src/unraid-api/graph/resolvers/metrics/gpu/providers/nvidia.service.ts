import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';

import { GpuVendor } from '@app/unraid-api/graph/resolvers/metrics/gpu/gpu.model.js';
import {
    GpuMonitoringProvider,
    RawGpuProcess,
    RawGpuReading,
} from '@app/unraid-api/graph/resolvers/metrics/gpu/providers/provider.interface.js';

const execFileAsync = promisify(execFile);

const NVIDIA_SMI_QUERY_FIELDS = [
    'gpu_bus_id',
    'gpu_name',
    'driver_version',
    'vbios_version',
    'utilization.gpu',
    'utilization.memory',
    'utilization.encoder',
    'utilization.decoder',
    'clocks.current.graphics',
    'clocks.current.memory',
    'power.draw',
    'power.limit',
    'fan.speed',
    'pstate',
    'memory.total',
    'memory.used',
    'memory.free',
    'temperature.gpu',
    'temperature.memory',
].join(',');

@Injectable()
export class NvidiaGpuService implements GpuMonitoringProvider {
    readonly id = 'nvidia-smi';
    private readonly logger = new Logger(NvidiaGpuService.name);

    async isAvailable(): Promise<boolean> {
        try {
            await execFileAsync('nvidia-smi', ['--version'], { timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }

    async readAll(): Promise<RawGpuReading[]> {
        const readings = await this.queryGpuMetrics();
        const busIdToId = new Map(readings.map((g) => [g.pciBusId, g.id]));
        const processMap = await this.queryProcesses(busIdToId);

        for (const reading of readings) {
            reading.processes = processMap.get(reading.id) ?? [];
        }

        return readings;
    }

    private async queryGpuMetrics(): Promise<RawGpuReading[]> {
        try {
            const { stdout } = await execFileAsync(
                'nvidia-smi',
                ['--query-gpu=' + NVIDIA_SMI_QUERY_FIELDS, '--format=csv,noheader,nounits'],
                { timeout: 10000 }
            );

            return stdout
                .trim()
                .split('\n')
                .filter((line) => line.trim().length > 0)
                .map((line, index) => this.parseGpuLine(line, index));
        } catch (err) {
            this.logger.error(`Failed to query nvidia-smi: ${err}`);
            return [];
        }
    }

    private parseGpuLine(line: string, index: number): RawGpuReading {
        const fields = line.split(',').map((f) => f.trim());

        return {
            id: `nvidia-gpu-${index}`,
            pciBusId: this.parseString(fields[0]),
            name: this.parseString(fields[1]) ?? `NVIDIA GPU ${index}`,
            vendor: GpuVendor.NVIDIA,
            driverVersion: this.parseString(fields[2]),
            vbiosVersion: this.parseString(fields[3]),
            coreUtilization: this.parseFloat(fields[4]),
            memoryUtilization: this.parseFloat(fields[5]),
            encoderUtilization: this.parseFloat(fields[6]),
            decoderUtilization: this.parseFloat(fields[7]),
            coreClock: this.parseInt(fields[8]),
            memoryClock: this.parseInt(fields[9]),
            powerDraw: this.parseFloat(fields[10]),
            powerLimit: this.parseFloat(fields[11]),
            fanSpeed: this.parseInt(fields[12]),
            performanceState: this.parseString(fields[13]),
            memoryTotal: this.parseFloat(fields[14]),
            memoryUsed: this.parseFloat(fields[15]),
            memoryFree: this.parseFloat(fields[16]),
            temperatureCore: this.parseFloat(fields[17]),
            temperatureMemory: this.parseFloat(fields[18]),
        };
    }

    private async queryProcesses(
        busIdToId: Map<string | undefined, string>
    ): Promise<Map<string, RawGpuProcess[]>> {
        const map = new Map<string, RawGpuProcess[]>();

        try {
            const { stdout } = await execFileAsync(
                'nvidia-smi',
                [
                    '--query-compute-apps=gpu_bus_id,pid,process_name,used_gpu_memory',
                    '--format=csv,noheader,nounits',
                ],
                { timeout: 10000 }
            );

            for (const line of stdout.trim().split('\n')) {
                if (!line.trim()) continue;
                const fields = line.split(',').map((f) => f.trim());
                const gpuBusId = fields[0];
                const gpuId = busIdToId.get(gpuBusId);
                if (!gpuId) continue;

                const process: RawGpuProcess = {
                    pid: Number(fields[1]) || 0,
                    name: fields[2] || undefined,
                    memoryUsage: this.parseFloat(fields[3]),
                };

                const existing = map.get(gpuId) ?? [];
                existing.push(process);
                map.set(gpuId, existing);
            }
        } catch {
            this.logger.debug('No NVIDIA compute processes found or query failed');
        }

        return map;
    }

    private parseString(value: string | undefined): string | undefined {
        if (!value || value === '[N/A]' || value === 'N/A' || value === 'Unknown Error') {
            return undefined;
        }
        return value;
    }

    private parseFloat(value: string | undefined): number | undefined {
        if (!value || value === '[N/A]' || value === 'N/A' || value === 'Unknown Error') {
            return undefined;
        }
        const num = Number.parseFloat(value);
        return Number.isFinite(num) ? num : undefined;
    }

    private parseInt(value: string | undefined): number | undefined {
        if (!value || value === '[N/A]' || value === 'N/A' || value === 'Unknown Error') {
            return undefined;
        }
        const num = Number.parseInt(value, 10);
        return Number.isFinite(num) ? num : undefined;
    }
}
