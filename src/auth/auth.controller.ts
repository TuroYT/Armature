import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import {
  AuthResponseDto,
  TokensResponseDto,
  UserResponseDto,
} from './dto/auth-response.dto.js';
import { AuthMethodsResponseDto } from './dto/auth-methods.dto.js';
import { Public } from './decorators/public.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { ErrorResponseDto } from '../common/dto/error-response.dto.js';
import type { AuthUser } from './strategies/jwt.strategy.js';
import type { RefreshTokenUser } from './strategies/jwt-refresh.strategy.js';

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('methods')
  @ApiOperation({ summary: 'List available authentication methods' })
  @ApiResponse({ status: 200, type: AuthMethodsResponseDto })
  getMethods(): AuthMethodsResponseDto {
    return { methods: this.authService.getAvailableMethods() };
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  @ApiResponse({
    status: 409,
    type: ErrorResponseDto,
    description: 'Email already in use',
  })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({
    status: 401,
    type: ErrorResponseDto,
    description: 'Invalid credentials',
  })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Public()
  @UseGuards(AuthGuard('jwt-refresh'))
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token and get new token pair' })
  @ApiResponse({ status: 200, type: TokensResponseDto })
  @ApiResponse({
    status: 401,
    type: ErrorResponseDto,
    description: 'Invalid or expired refresh token',
  })
  refresh(@CurrentUser() user: RefreshTokenUser): Promise<TokensResponseDto> {
    return this.authService.refresh(user.id, user.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invalidate the current refresh token' })
  @ApiResponse({ status: 204, description: 'Logged out' })
  async logout(
    @CurrentUser() user: AuthUser,
    @Body() dto: RefreshTokenDto,
  ): Promise<void> {
    await this.authService.logout(user.id, dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the currently authenticated user' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  getMe(@CurrentUser() user: AuthUser): Promise<UserResponseDto> {
    return this.authService.getMe(user.id);
  }
}
