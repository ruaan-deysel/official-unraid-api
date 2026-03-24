import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ConfigFilePersister } from '@unraid/shared/services/config-file.js';

import { GpuMonitoringConfig } from '@app/unraid-api/graph/resolvers/metrics/gpu/gpu-config.model.js';
import { validateObject } from '@app/unraid-api/graph/resolvers/validation.utils.js';

@Injectable()
export class GpuMonitoringConfigService extends ConfigFilePersister<GpuMonitoringConfig> {
    constructor(configService: ConfigService) {
        super(configService);
    }

    enabled(): boolean {
        return true;
    }

    configKey(): string {
        return 'gpuMonitoring';
    }

    fileName(): string {
        return 'gpu-monitoring.json';
    }

    defaultConfig(): GpuMonitoringConfig {
        return {
            enabled: true,
            polling_interval: 3000,
            thresholds: {
                warning: 80,
                critical: 95,
            },
        };
    }

    async validate(config: object): Promise<GpuMonitoringConfig> {
        return validateObject(GpuMonitoringConfig, config);
    }
}
