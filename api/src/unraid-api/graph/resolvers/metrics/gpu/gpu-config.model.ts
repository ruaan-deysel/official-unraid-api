import { Field, Float, InputType, Int, ObjectType } from '@nestjs/graphql';

import { IsBoolean, IsNumber, IsOptional } from 'class-validator';

@ObjectType({ description: 'GPU temperature threshold configuration' })
export class GpuThresholdsConfig {
    @Field(() => Float, { nullable: true, description: 'Warning temperature threshold in Celsius' })
    @IsNumber()
    @IsOptional()
    warning?: number;

    @Field(() => Float, { nullable: true, description: 'Critical temperature threshold in Celsius' })
    @IsNumber()
    @IsOptional()
    critical?: number;
}

@ObjectType({ description: 'GPU monitoring configuration' })
export class GpuMonitoringConfig {
    @Field({ nullable: true, description: 'Whether GPU monitoring is enabled' })
    @IsBoolean()
    @IsOptional()
    enabled?: boolean;

    @Field(() => Int, { nullable: true, description: 'Polling interval in milliseconds' })
    @IsNumber()
    @IsOptional()
    polling_interval?: number;

    @Field(() => GpuThresholdsConfig, { nullable: true })
    @IsOptional()
    thresholds?: GpuThresholdsConfig;
}

@InputType({ description: 'GPU temperature threshold configuration input' })
export class GpuThresholdsInput {
    @Field(() => Float, { nullable: true })
    @IsNumber()
    @IsOptional()
    warning?: number;

    @Field(() => Float, { nullable: true })
    @IsNumber()
    @IsOptional()
    critical?: number;
}

@InputType({ description: 'GPU monitoring configuration input' })
export class UpdateGpuMonitoringConfigInput {
    @Field({ nullable: true })
    @IsBoolean()
    @IsOptional()
    enabled?: boolean;

    @Field(() => Int, { nullable: true })
    @IsNumber()
    @IsOptional()
    polling_interval?: number;

    @Field(() => GpuThresholdsInput, { nullable: true })
    @IsOptional()
    thresholds?: GpuThresholdsInput;
}
