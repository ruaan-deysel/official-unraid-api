import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { GpuMonitoringConfigService } from '@app/unraid-api/graph/resolvers/metrics/gpu/gpu-config.service.js';
import { GpuMonitoringService } from '@app/unraid-api/graph/resolvers/metrics/gpu/gpu.service.js';
import { AmdGpuService } from '@app/unraid-api/graph/resolvers/metrics/gpu/providers/amd.service.js';
import { IntelGpuService } from '@app/unraid-api/graph/resolvers/metrics/gpu/providers/intel.service.js';
import { NvidiaGpuService } from '@app/unraid-api/graph/resolvers/metrics/gpu/providers/nvidia.service.js';

@Module({
    providers: [
        {
            provide: GpuMonitoringConfigService,
            useFactory: async (configService: ConfigService) => {
                const service = new GpuMonitoringConfigService(configService);
                await service.onModuleInit();
                return service;
            },
            inject: [ConfigService],
        },
        GpuMonitoringService,
        NvidiaGpuService,
        AmdGpuService,
        IntelGpuService,
    ],
    exports: [GpuMonitoringService, GpuMonitoringConfigService],
})
export class GpuMonitoringModule {}
