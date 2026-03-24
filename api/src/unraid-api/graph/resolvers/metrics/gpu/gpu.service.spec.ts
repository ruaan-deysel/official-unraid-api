import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GpuMonitoringConfigService } from '@app/unraid-api/graph/resolvers/metrics/gpu/gpu-config.service.js';
import { GpuVendor } from '@app/unraid-api/graph/resolvers/metrics/gpu/gpu.model.js';
import { GpuMonitoringService } from '@app/unraid-api/graph/resolvers/metrics/gpu/gpu.service.js';
import { AmdGpuService } from '@app/unraid-api/graph/resolvers/metrics/gpu/providers/amd.service.js';
import { IntelGpuService } from '@app/unraid-api/graph/resolvers/metrics/gpu/providers/intel.service.js';
import { NvidiaGpuService } from '@app/unraid-api/graph/resolvers/metrics/gpu/providers/nvidia.service.js';
import {
    GpuMonitoringProvider,
    RawGpuReading,
} from '@app/unraid-api/graph/resolvers/metrics/gpu/providers/provider.interface.js';

describe('GpuMonitoringService', () => {
    let service: GpuMonitoringService;
    let nvidiaService: Partial<GpuMonitoringProvider>;
    let amdService: Partial<GpuMonitoringProvider>;
    let intelService: Partial<GpuMonitoringProvider>;
    let configService: Partial<GpuMonitoringConfigService>;

    const mockNvidiaReading: RawGpuReading = {
        id: 'nvidia-gpu-0',
        name: 'NVIDIA GeForce RTX 4090',
        vendor: GpuVendor.NVIDIA,
        pciBusId: '00000000:01:00.0',
        driverVersion: '545.29.06',
        coreUtilization: 45,
        memoryUtilization: 30,
        coreClock: 2100,
        memoryClock: 10501,
        powerDraw: 250.5,
        powerLimit: 450,
        fanSpeed: 55,
        performanceState: 'P0',
        memoryTotal: 24564,
        memoryUsed: 8192,
        memoryFree: 16372,
        temperatureCore: 65,
        temperatureMemory: 72,
        processes: [{ pid: 1234, name: 'ffmpeg', memoryUsage: 2048 }],
    };

    const mockAmdReading: RawGpuReading = {
        id: 'amd-gpu-0',
        name: 'AMD Radeon RX 7900 XTX',
        vendor: GpuVendor.AMD,
        coreUtilization: 80,
        memoryTotal: 24576,
        memoryUsed: 12000,
        memoryFree: 12576,
        temperatureCore: 70,
        powerDraw: 300,
    };

    beforeEach(async () => {
        nvidiaService = {
            id: 'nvidia-smi',
            isAvailable: vi.fn().mockResolvedValue(true),
            readAll: vi.fn().mockResolvedValue([mockNvidiaReading]),
        };

        amdService = {
            id: 'amd-rocm-smi',
            isAvailable: vi.fn().mockResolvedValue(false),
            readAll: vi.fn().mockResolvedValue([]),
        };

        intelService = {
            id: 'intel-gpu',
            isAvailable: vi.fn().mockResolvedValue(false),
            readAll: vi.fn().mockResolvedValue([]),
        };

        configService = {
            getConfig: vi.fn().mockReturnValue({
                enabled: true,
                polling_interval: 3000,
                thresholds: { warning: 80, critical: 95 },
            }),
        };

        service = new GpuMonitoringService(
            nvidiaService as unknown as NvidiaGpuService,
            amdService as unknown as AmdGpuService,
            intelService as unknown as IntelGpuService,
            configService as unknown as GpuMonitoringConfigService
        );

        await service.onModuleInit();
    });

    describe('onModuleInit', () => {
        it('should detect available providers', async () => {
            expect(nvidiaService.isAvailable).toHaveBeenCalled();
            expect(amdService.isAvailable).toHaveBeenCalled();
            expect(intelService.isAvailable).toHaveBeenCalled();
        });

        it('should handle when no providers are available', async () => {
            vi.mocked(nvidiaService.isAvailable!).mockResolvedValue(false);

            const emptyService = new GpuMonitoringService(
                nvidiaService as unknown as NvidiaGpuService,
                amdService as unknown as AmdGpuService,
                intelService as unknown as IntelGpuService,
                configService as unknown as GpuMonitoringConfigService
            );
            await emptyService.onModuleInit();

            const metrics = await emptyService.getMetrics();
            expect(metrics.devices).toHaveLength(0);
            expect(metrics.summary.totalDevices).toBe(0);
        });
    });

    describe('getMetrics', () => {
        it('should return metrics from available providers', async () => {
            const metrics = await service.getMetrics();

            expect(metrics.id).toBe('gpuMonitoring');
            expect(metrics.devices).toHaveLength(1);
            expect(metrics.devices[0].name).toBe('NVIDIA GeForce RTX 4090');
            expect(metrics.devices[0].vendor).toBe(GpuVendor.NVIDIA);
        });

        it('should map utilization fields correctly', async () => {
            const metrics = await service.getMetrics();
            const device = metrics.devices[0];

            expect(device.utilization?.coreUtilization).toBe(45);
            expect(device.utilization?.memoryUtilization).toBe(30);
            expect(device.utilization?.coreClock).toBe(2100);
            expect(device.utilization?.powerDraw).toBe(250.5);
            expect(device.utilization?.fanSpeed).toBe(55);
        });

        it('should map memory fields correctly', async () => {
            const metrics = await service.getMetrics();
            const device = metrics.devices[0];

            expect(device.memory?.total).toBe(24564);
            expect(device.memory?.used).toBe(8192);
            expect(device.memory?.free).toBe(16372);
        });

        it('should map temperature fields correctly', async () => {
            const metrics = await service.getMetrics();
            const device = metrics.devices[0];

            expect(device.temperature?.core).toBe(65);
            expect(device.temperature?.memory).toBe(72);
        });

        it('should map process list correctly', async () => {
            const metrics = await service.getMetrics();
            const device = metrics.devices[0];

            expect(device.processes).toHaveLength(1);
            expect(device.processes![0].pid).toBe(1234);
            expect(device.processes![0].name).toBe('ffmpeg');
            expect(device.processes![0].memoryUsage).toBe(2048);
        });

        it('should return empty metrics when disabled', async () => {
            vi.mocked(configService.getConfig!).mockReturnValue({
                enabled: false,
                polling_interval: 3000,
                thresholds: { warning: 80, critical: 95 },
            });

            // Clear cache so we re-fetch
            service['cache'] = null;

            const metrics = await service.getMetrics();
            expect(metrics.devices).toHaveLength(0);
            expect(metrics.summary.totalDevices).toBe(0);
        });

        it('should use cache within TTL', async () => {
            await service.getMetrics();
            await service.getMetrics();

            expect(nvidiaService.readAll).toHaveBeenCalledTimes(1);
        });

        it('should aggregate multiple providers', async () => {
            vi.mocked(amdService.isAvailable!).mockResolvedValue(true);
            vi.mocked(amdService.readAll!).mockResolvedValue([mockAmdReading]);

            const multiService = new GpuMonitoringService(
                nvidiaService as unknown as NvidiaGpuService,
                amdService as unknown as AmdGpuService,
                intelService as unknown as IntelGpuService,
                configService as unknown as GpuMonitoringConfigService
            );
            await multiService.onModuleInit();

            const metrics = await multiService.getMetrics();
            expect(metrics.devices).toHaveLength(2);
            expect(metrics.summary.totalDevices).toBe(2);
        });

        it('should handle provider errors gracefully', async () => {
            vi.mocked(nvidiaService.readAll!).mockRejectedValue(new Error('nvidia-smi crashed'));

            service['cache'] = null;

            const metrics = await service.getMetrics();
            expect(metrics.devices).toHaveLength(0);
        });
    });

    describe('buildSummary', () => {
        it('should compute averages and totals correctly', async () => {
            vi.mocked(amdService.isAvailable!).mockResolvedValue(true);
            vi.mocked(amdService.readAll!).mockResolvedValue([mockAmdReading]);

            const multiService = new GpuMonitoringService(
                nvidiaService as unknown as NvidiaGpuService,
                amdService as unknown as AmdGpuService,
                intelService as unknown as IntelGpuService,
                configService as unknown as GpuMonitoringConfigService
            );
            await multiService.onModuleInit();

            const metrics = await multiService.getMetrics();

            expect(metrics.summary.totalDevices).toBe(2);
            // Average of 45 and 80 = 62.5
            expect(metrics.summary.averageCoreUtilization).toBe(62.5);
            // Total power: 250.5 + 300 = 550.5
            expect(metrics.summary.totalPowerDraw).toBe(550.5);
            // Max temp: max(65, 70) = 70
            expect(metrics.summary.maxTemperature).toBe(70);
        });

        it('should handle devices with missing fields', async () => {
            const sparseReading: RawGpuReading = {
                id: 'nvidia-gpu-0',
                name: 'Basic GPU',
                vendor: GpuVendor.NVIDIA,
            };

            vi.mocked(nvidiaService.readAll!).mockResolvedValue([sparseReading]);
            service['cache'] = null;

            const metrics = await service.getMetrics();
            expect(metrics.summary.averageCoreUtilization).toBeUndefined();
            expect(metrics.summary.totalPowerDraw).toBeUndefined();
            expect(metrics.summary.maxTemperature).toBeUndefined();
        });
    });
});
