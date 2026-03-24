import { GpuVendor } from '@app/unraid-api/graph/resolvers/metrics/gpu/gpu.model.js';

export interface RawGpuReading {
    id: string;
    name: string;
    vendor: GpuVendor;
    pciBusId?: string;
    driverVersion?: string;
    vbiosVersion?: string;

    coreUtilization?: number;
    memoryUtilization?: number;
    encoderUtilization?: number;
    decoderUtilization?: number;
    coreClock?: number;
    memoryClock?: number;
    powerDraw?: number;
    powerLimit?: number;
    fanSpeed?: number;
    performanceState?: string;

    memoryTotal?: number;
    memoryUsed?: number;
    memoryFree?: number;

    temperatureCore?: number;
    temperatureMemory?: number;
    temperatureHotspot?: number;

    processes?: RawGpuProcess[];
}

export interface RawGpuProcess {
    pid: number;
    name?: string;
    memoryUsage?: number;
}

export interface GpuMonitoringProvider {
    readonly id: string;

    isAvailable(): Promise<boolean>;

    readAll(): Promise<RawGpuReading[]>;
}
