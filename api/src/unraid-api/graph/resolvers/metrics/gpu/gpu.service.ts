import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { GpuMonitoringConfigService } from '@app/unraid-api/graph/resolvers/metrics/gpu/gpu-config.service.js';
import {
    GpuDevice,
    GpuMemory,
    GpuMonitoringMetrics,
    GpuMonitoringSummary,
    GpuProcess,
    GpuTemperature,
    GpuUtilization,
} from '@app/unraid-api/graph/resolvers/metrics/gpu/gpu.model.js';
import { AmdGpuService } from '@app/unraid-api/graph/resolvers/metrics/gpu/providers/amd.service.js';
import { IntelGpuService } from '@app/unraid-api/graph/resolvers/metrics/gpu/providers/intel.service.js';
import { NvidiaGpuService } from '@app/unraid-api/graph/resolvers/metrics/gpu/providers/nvidia.service.js';
import {
    GpuMonitoringProvider,
    RawGpuReading,
} from '@app/unraid-api/graph/resolvers/metrics/gpu/providers/provider.interface.js';

@Injectable()
export class GpuMonitoringService implements OnModuleInit {
    private readonly logger = new Logger(GpuMonitoringService.name);
    private providers: GpuMonitoringProvider[] = [];
    private availableProviders: GpuMonitoringProvider[] = [];
    private cache: GpuMonitoringMetrics | null = null;
    private cacheTimestamp = 0;
    private readonly CACHE_TTL_MS = 1000;

    constructor(
        private readonly nvidiaService: NvidiaGpuService,
        private readonly amdService: AmdGpuService,
        private readonly intelService: IntelGpuService,
        private readonly configService: GpuMonitoringConfigService
    ) {}

    async onModuleInit(): Promise<void> {
        this.providers = [this.nvidiaService, this.amdService, this.intelService];

        for (const provider of this.providers) {
            const available = await provider.isAvailable();
            if (available) {
                this.availableProviders.push(provider);
                this.logger.log(`GPU provider available: ${provider.id}`);
            } else {
                this.logger.debug(`GPU provider not available: ${provider.id}`);
            }
        }

        if (this.availableProviders.length === 0) {
            this.logger.warn('No GPU monitoring providers detected');
        }
    }

    async getMetrics(): Promise<GpuMonitoringMetrics> {
        const isCacheValid = this.cache && Date.now() - this.cacheTimestamp < this.CACHE_TTL_MS;
        if (isCacheValid && this.cache) {
            return this.cache;
        }

        const config = this.configService.getConfig();
        if (!config.enabled) {
            return this.emptyMetrics();
        }

        const devices: GpuDevice[] = [];

        for (const provider of this.availableProviders) {
            try {
                const readings = await provider.readAll();
                for (const reading of readings) {
                    devices.push(this.toGpuDevice(reading));
                }
            } catch (err) {
                this.logger.error(`Error reading from ${provider.id}: ${err}`);
            }
        }

        const summary = this.buildSummary(devices);

        const metrics = Object.assign(new GpuMonitoringMetrics(), {
            id: 'gpuMonitoring',
            devices,
            summary,
        });

        this.cache = metrics;
        this.cacheTimestamp = Date.now();

        return metrics;
    }

    private toGpuDevice(reading: RawGpuReading): GpuDevice {
        const utilization: GpuUtilization = {
            coreUtilization: reading.coreUtilization,
            memoryUtilization: reading.memoryUtilization,
            encoderUtilization: reading.encoderUtilization,
            decoderUtilization: reading.decoderUtilization,
            coreClock: reading.coreClock,
            memoryClock: reading.memoryClock,
            powerDraw: reading.powerDraw,
            powerLimit: reading.powerLimit,
            fanSpeed: reading.fanSpeed,
            performanceState: reading.performanceState,
            timestamp: new Date(),
        };

        const memory: GpuMemory = {
            total: reading.memoryTotal,
            used: reading.memoryUsed,
            free: reading.memoryFree,
        };

        const temperature: GpuTemperature = {
            core: reading.temperatureCore,
            memory: reading.temperatureMemory,
            hotspot: reading.temperatureHotspot,
        };

        const processes: GpuProcess[] | undefined = reading.processes?.map((p) => ({
            pid: p.pid,
            name: p.name,
            memoryUsage: p.memoryUsage,
        }));

        return Object.assign(new GpuDevice(), {
            id: reading.id,
            name: reading.name,
            vendor: reading.vendor,
            pciBusId: reading.pciBusId,
            driverVersion: reading.driverVersion,
            vbiosVersion: reading.vbiosVersion,
            utilization,
            memory,
            temperature,
            processes,
        });
    }

    private buildSummary(devices: GpuDevice[]): GpuMonitoringSummary {
        const coreUtils = devices
            .map((d) => d.utilization?.coreUtilization)
            .filter((v): v is number => v !== undefined);
        const powers = devices
            .map((d) => d.utilization?.powerDraw)
            .filter((v): v is number => v !== undefined);
        const temps = devices
            .map((d) => d.temperature?.core)
            .filter((v): v is number => v !== undefined);

        return {
            totalDevices: devices.length,
            averageCoreUtilization:
                coreUtils.length > 0
                    ? Math.round((coreUtils.reduce((a, b) => a + b, 0) / coreUtils.length) * 100) / 100
                    : undefined,
            totalPowerDraw:
                powers.length > 0
                    ? Math.round(powers.reduce((a, b) => a + b, 0) * 100) / 100
                    : undefined,
            maxTemperature: temps.length > 0 ? Math.max(...temps) : undefined,
        };
    }

    private emptyMetrics(): GpuMonitoringMetrics {
        return Object.assign(new GpuMonitoringMetrics(), {
            id: 'gpuMonitoring',
            devices: [],
            summary: {
                totalDevices: 0,
            },
        });
    }
}
