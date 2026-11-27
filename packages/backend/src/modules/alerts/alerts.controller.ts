import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AlertsService } from './alerts.service';
import { CreateAlertRuleDto } from './dto/create-alert-rule.dto';
import { UpdateAlertRuleDto } from './dto/update-alert-rule.dto';

@ApiTags('alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  findAll(@Req() req: any) {
    const orgId: string = req.user.organizationId;
    return this.alertsService.findAll(orgId);
  }

  @Post()
  create(@Body() dto: CreateAlertRuleDto, @Req() req: any) {
    const orgId: string = req.user.organizationId;
    const userId: string | null = req.user.sub ?? req.user.id ?? null;
    return this.alertsService.createRule(dto, userId, orgId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    const orgId: string = req.user.organizationId;
    return this.alertsService.findOne(id, orgId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAlertRuleDto, @Req() req: any) {
    const orgId: string = req.user.organizationId;
    return this.alertsService.updateRule(id, dto, orgId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Req() req: any) {
    const orgId: string = req.user.organizationId;
    await this.alertsService.removeRule(id, orgId);
  }

  @Get(':id/events')
  getEvents(
    @Param('id') id: string,
    @Query('limit') limit: string,
    @Req() req: any,
  ) {
    const orgId: string = req.user.organizationId;
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    return this.alertsService.getEvents(id, orgId, parsedLimit);
  }

  @Post(':id/check')
  async manualCheck(@Param('id') id: string, @Req() req: any) {
    const orgId: string = req.user.organizationId;
    const rule = await this.alertsService.findOne(id, orgId);
    await this.alertsService.evaluateRule(rule);
    return { message: 'Alert check completed', ruleId: id };
  }
}
