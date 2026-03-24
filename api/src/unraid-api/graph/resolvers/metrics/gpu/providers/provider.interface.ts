import { GpuVendor } from '@app/unraid-api/graph/resolvers/metrics/gpu/gpu.model.js';

export interface RawGpuReading {
    id: string;
    name: string;
    vendor: GpuVendor;
    pciBusId?: string;
    driverVersion?: string;
    vbiosVersion?: string;

    /** GPU core utilization in percent (0-100) */
    coreUtilization?: number;
    /** GPU memory controller utilization in percent (0-100) */
    memoryUtilization?: number;
    /** Video encoder utilization in percent (0-100) */
    encoderUtilization?: number;
    /** Video decoder utilization in percent (0-100) */
    decoderUtilization?: number;
    /** Current core clock speed in MHz */
    coreClock?: number;
    /** Current memory clock speed in MHz */
    memoryClock?: number;
    /** Current power draw in watts */
    powerDraw?: number;
    /** Power limit in watts */
    powerLimit?: number;
    /** Fan speed in percent (0-100) */
    fanSpeed?: number;
    performanceState?: string;

    /** Total GPU memory in MiB */
    memoryTotal?: number;
    /** Used GPU memory in MiB */
    memoryUsed?: number;
    /** Free GPU memory in MiB */
    memoryFree?: number;

    /** Core GPU temperature in degrees Celsius */
    temperatureCore?: number;
    /** Memory temperature in degrees Celsius */
    temperatureMemory?: number;
    /** Hotspot temperature in degrees Celsius */
    temperatureHotspot?: number;

    processes?: RawGpuProcess[];
}

export interface RawGpuProcess {
    pid: number;
    name?: string;
    /** GPU memory used by this process in MiB */
    memoryUsage?: number;
}

export interface GpuMonitoringProvider {
    readonly id: string;

    isAvailable(): Promise<boolean>;

    readAll(): Promise<RawGpuReading[]>;
}
