import { Field, Float, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

import { Node } from '@unraid/shared/graphql.model.js';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export enum GpuVendor {
    NVIDIA = 'NVIDIA',
    AMD = 'AMD',
    INTEL = 'INTEL',
    UNKNOWN = 'UNKNOWN',
}

registerEnumType(GpuVendor, {
    name: 'GpuVendor',
    description: 'GPU vendor/manufacturer',
});

@ObjectType({ description: 'GPU performance and utilization metrics' })
export class GpuUtilization {
    @Field(() => Float, { nullable: true, description: 'GPU core utilization percentage (0-100)' })
    @IsOptional()
    @IsNumber()
    coreUtilization?: number;

    @Field(() => Float, { nullable: true, description: 'GPU memory utilization percentage (0-100)' })
    @IsOptional()
    @IsNumber()
    memoryUtilization?: number;

    @Field(() => Float, { nullable: true, description: 'Encoder utilization percentage (0-100)' })
    @IsOptional()
    @IsNumber()
    encoderUtilization?: number;

    @Field(() => Float, { nullable: true, description: 'Decoder utilization percentage (0-100)' })
    @IsOptional()
    @IsNumber()
    decoderUtilization?: number;

    @Field(() => Int, { nullable: true, description: 'Current core clock speed in MHz' })
    @IsOptional()
    @IsNumber()
    coreClock?: number;

    @Field(() => Int, { nullable: true, description: 'Current memory clock speed in MHz' })
    @IsOptional()
    @IsNumber()
    memoryClock?: number;

    @Field(() => Float, { nullable: true, description: 'Current power draw in watts' })
    @IsOptional()
    @IsNumber()
    powerDraw?: number;

    @Field(() => Float, { nullable: true, description: 'Power limit in watts' })
    @IsOptional()
    @IsNumber()
    powerLimit?: number;

    @Field(() => Int, { nullable: true, description: 'Fan speed percentage (0-100)' })
    @IsOptional()
    @IsNumber()
    fanSpeed?: number;

    @Field(() => String, { nullable: true, description: 'Performance state (e.g. P0-P12 for NVIDIA)' })
    @IsOptional()
    @IsString()
    performanceState?: string;

    @Field(() => Date, { description: 'Timestamp of the reading' })
    timestamp!: Date;
}

@ObjectType({ description: 'GPU memory information' })
export class GpuMemory {
    @Field(() => Float, { nullable: true, description: 'Total GPU memory in MiB' })
    @IsOptional()
    @IsNumber()
    total?: number;

    @Field(() => Float, { nullable: true, description: 'Used GPU memory in MiB' })
    @IsOptional()
    @IsNumber()
    used?: number;

    @Field(() => Float, { nullable: true, description: 'Free GPU memory in MiB' })
    @IsOptional()
    @IsNumber()
    free?: number;
}

@ObjectType({ description: 'GPU temperature readings' })
export class GpuTemperature {
    @Field(() => Float, { nullable: true, description: 'Core GPU temperature in Celsius' })
    @IsOptional()
    @IsNumber()
    core?: number;

    @Field(() => Float, { nullable: true, description: 'Memory temperature in Celsius (if available)' })
    @IsOptional()
    @IsNumber()
    memory?: number;

    @Field(() => Float, { nullable: true, description: 'Hotspot temperature in Celsius (if available)' })
    @IsOptional()
    @IsNumber()
    hotspot?: number;
}

@ObjectType({ description: 'Process using the GPU' })
export class GpuProcess {
    @Field(() => Int, { description: 'Process ID' })
    @IsNumber()
    pid!: number;

    @Field(() => String, { nullable: true, description: 'Process name' })
    @IsOptional()
    @IsString()
    name?: string;

    @Field(() => Float, { nullable: true, description: 'Memory used by this process in MiB' })
    @IsOptional()
    @IsNumber()
    memoryUsage?: number;
}

@ObjectType({ implements: () => Node, description: 'A GPU device with monitoring data' })
export class GpuDevice extends Node {
    @Field(() => String, { description: 'GPU product name' })
    @IsString()
    name!: string;

    @Field(() => GpuVendor, { description: 'GPU vendor' })
    @IsEnum(GpuVendor)
    vendor!: GpuVendor;

    @Field(() => String, { nullable: true, description: 'PCI bus ID' })
    @IsOptional()
    @IsString()
    pciBusId?: string;

    @Field(() => String, { nullable: true, description: 'Driver version' })
    @IsOptional()
    @IsString()
    driverVersion?: string;

    @Field(() => String, { nullable: true, description: 'VBIOS version' })
    @IsOptional()
    @IsString()
    vbiosVersion?: string;

    @Field(() => GpuUtilization, { nullable: true, description: 'Current utilization metrics' })
    @IsOptional()
    utilization?: GpuUtilization;

    @Field(() => GpuMemory, { nullable: true, description: 'Memory information' })
    @IsOptional()
    memory?: GpuMemory;

    @Field(() => GpuTemperature, { nullable: true, description: 'Temperature readings' })
    @IsOptional()
    temperature?: GpuTemperature;

    @Field(() => [GpuProcess], { nullable: true, description: 'Processes using this GPU' })
    @IsOptional()
    processes?: GpuProcess[];
}

@ObjectType({ description: 'Summary of all GPU devices' })
export class GpuMonitoringSummary {
    @Field(() => Int, { description: 'Total number of GPU devices detected' })
    @IsNumber()
    totalDevices!: number;

    @Field(() => Float, { nullable: true, description: 'Average core utilization across all GPUs' })
    @IsOptional()
    @IsNumber()
    averageCoreUtilization?: number;

    @Field(() => Float, { nullable: true, description: 'Total power draw across all GPUs in watts' })
    @IsOptional()
    @IsNumber()
    totalPowerDraw?: number;

    @Field(() => Float, { nullable: true, description: 'Highest temperature across all GPUs' })
    @IsOptional()
    @IsNumber()
    maxTemperature?: number;
}

@ObjectType({ implements: () => Node, description: 'GPU monitoring metrics' })
export class GpuMonitoringMetrics extends Node {
    @Field(() => [GpuDevice], { description: 'All detected GPU devices' })
    devices!: GpuDevice[];

    @Field(() => GpuMonitoringSummary, { description: 'GPU monitoring summary' })
    summary!: GpuMonitoringSummary;
}
