import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiHeader,
  ApiOkResponse,
} from '@nestjs/swagger';
import { LandingPageService } from './landing-page.service.js';
import {
  UpdateLandingPageThemeDto,
  UpdateLandingPageContentDto,
} from './dto/update-landing-page.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RoleGuard } from '../../guards/role.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '../../enums/role.enum.js';
import { Public } from '../../common/decorators/public.decorator.js';

@ApiTags('Landing Page')
@ApiHeader({
  name: 'company-domain',
  description:
    'The domain (or company ID in dev) used to scope the landing page to the correct tenant.',
  required: true,
})
@Controller({ path: 'landing-page', version: '1' })
export class LandingPageController {
  constructor(private readonly landingPageService: LandingPageService) {}

  /**
   * GET /landing-page
   * Public endpoint — returns the published theme + content for the given domain.
   * Used by the Next.js frontend to hydrate the landing page SSR.
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Get landing page theme + content (public)' })
  @ApiOkResponse({ description: 'Returns { theme, content, isPublished }' })
  async getLandingPageData(@Headers('company-domain') domain: string) {
    return this.landingPageService.getLandingPageData(domain);
  }

  /**
   * POST /landing-page/theme
   * Admin only — updates the JSONB theme config for the company.
   */
  @Post('theme')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update landing page theme (admin only)' })
  async updateTheme(
    @Headers('company-domain') domain: string,
    @Body() dto: UpdateLandingPageThemeDto,
  ) {
    return this.landingPageService.updateTheme(domain, dto);
  }

  /**
   * POST /landing-page/content
   * Admin only — overwrites the full JSONB content blob for the company.
   */
  @Post('content')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update landing page content (admin only)' })
  async updateContent(
    @Headers('company-domain') domain: string,
    @Body() dto: UpdateLandingPageContentDto,
  ) {
    return this.landingPageService.updateContent(domain, dto);
  }

  /**
   * POST /landing-page/publish
   * Admin only — toggles is_published true/false.
   * Useful for drafting changes before going live.
   */
  @Post('publish')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Toggle landing page publish status (admin only)',
    description:
      'Flips is_published. Returns the new isPublished state. Content must be saved before publishing.',
  })
  async togglePublish(@Headers('company-domain') domain: string) {
    return this.landingPageService.togglePublish(domain);
  }
}
