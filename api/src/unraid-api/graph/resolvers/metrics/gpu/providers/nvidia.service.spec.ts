import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GpuVendor } from '@app/unraid-api/graph/resolvers/metrics/gpu/gpu.model.js';
import { NvidiaGpuService } from '@app/unraid-api/graph/resolvers/metrics/gpu/providers/nvidia.service.js';

const { mockExecFileAsync } = vi.hoisted(() => ({
    mockExecFileAsync: vi.fn(),
}));
vi.mock('util', () => ({
    promisify: () => mockExecFileAsync,
}));

describe('NvidiaGpuService', () => {
    let service: NvidiaGpuService;

    beforeEach(() => {
        service = new NvidiaGpuService();
        mockExecFileAsync.mockReset();
    });

    describe('isAvailable', () => {
        it('should return true when nvidia-smi exists', async () => {
            mockExecFileAsync.mockResolvedValueOnce({ stdout: 'NVIDIA-SMI version' });

            const result = await service.isAvailable();
            expect(result).toBe(true);
        });

        it('should return false when nvidia-smi is not found', async () => {
            mockExecFileAsync.mockRejectedValueOnce(new Error('command not found'));

            const result = await service.isAvailable();
            expect(result).toBe(false);
        });
    });

    describe('readAll', () => {
        it('should parse nvidia-smi CSV output correctly', async () => {
            const gpuCsvLine =
                '00000000:01:00.0, NVIDIA GeForce RTX 4090, 545.29.06, 95.02.3C.80.AC, 45, 30, 10, 5, 2100, 10501, 250.50, 450.00, 55, P0, 24564, 8192, 16372, 65, 72';

            // First call: queryGpuMetrics
            mockExecFileAsync.mockResolvedValueOnce({ stdout: gpuCsvLine });
            // Second call: queryProcesses
            mockExecFileAsync.mockResolvedValueOnce({ stdout: '' });

            const readings = await service.readAll();

            expect(readings).toHaveLength(1);
            const gpu = readings[0];
            expect(gpu.vendor).toBe(GpuVendor.NVIDIA);
            expect(gpu.name).toBe('NVIDIA GeForce RTX 4090');
            expect(gpu.pciBusId).toBe('00000000:01:00.0');
            expect(gpu.driverVersion).toBe('545.29.06');
            expect(gpu.coreUtilization).toBe(45);
            expect(gpu.memoryUtilization).toBe(30);
            expect(gpu.powerDraw).toBe(250.5);
            expect(gpu.temperatureCore).toBe(65);
            expect(gpu.temperatureMemory).toBe(72);
        });

        it('should handle [N/A] values', async () => {
            const naLine =
                '00000000:01:00.0, NVIDIA GPU, 545.29.06, [N/A], 45, [N/A], [N/A], [N/A], 2100, [N/A], 250.50, 450.00, [N/A], P0, 24564, 8192, 16372, 65, [N/A]';

            mockExecFileAsync.mockResolvedValueOnce({ stdout: naLine });
            mockExecFileAsync.mockResolvedValueOnce({ stdout: '' });

            const readings = await service.readAll();
            const gpu = readings[0];

            expect(gpu.vbiosVersion).toBeUndefined();
            expect(gpu.memoryUtilization).toBeUndefined();
            expect(gpu.temperatureMemory).toBeUndefined();
            expect(gpu.fanSpeed).toBeUndefined();
        });

        it('should handle nvidia-smi failure gracefully', async () => {
            mockExecFileAsync.mockRejectedValueOnce(new Error('nvidia-smi crashed'));
            mockExecFileAsync.mockResolvedValueOnce({ stdout: '' });

            const readings = await service.readAll();
            expect(readings).toHaveLength(0);
        });

        it('should parse process information', async () => {
            const gpuCsvLine =
                '00000000:01:00.0, NVIDIA GPU, 545.29.06, bios, 45, 30, 10, 5, 2100, 10501, 250.50, 450.00, 55, P0, 24564, 8192, 16372, 65, 72';

            // First call from readAll -> queryGpuMetrics
            mockExecFileAsync.mockResolvedValueOnce({ stdout: gpuCsvLine });
            // Second call from readAll -> queryProcesses -> queryGpuMetrics (internal)
            mockExecFileAsync.mockResolvedValueOnce({
                stdout: '00000000:01:00.0, 1234, ffmpeg, 2048\n',
            });
            // Third call from queryProcesses -> queryGpuMetrics (to build busId map)
            mockExecFileAsync.mockResolvedValueOnce({ stdout: gpuCsvLine });

            const readings = await service.readAll();

            expect(readings).toHaveLength(1);
            expect(readings[0].processes).toBeDefined();
        });
    });
});
