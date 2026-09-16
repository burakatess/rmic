import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

/** HYPOTHETICAL bir senaryo, bağlı bir gerçek riske sahip değilse aktarımda YENİ
 * bir Risk oluşturulur — bu durumda gerekli idari alanlar (kategori/sorumlu)
 * simülasyonun kendisinde tutulmaz (skorlamaya dahil değildir), aktarım anında
 * açıkça toplanır. */
export class NewRiskMetaDto {
  @IsString() @MaxLength(200) name!: string;
  @IsString() @MaxLength(5000) description!: string;
  @IsString() categoryId!: string;
  @IsString() ownerId!: string;
}

/** Transfer edilecek her uygulanmış hipotetik aksiyon için gerçek Action'ın
 * zorunlu alanları (sorumlu + termin) — simülasyonda tutulmaz, aktarımda toplanır. */
export class ActionAssignmentDto {
  @IsString() scenarioActionId!: string;
  @IsString() ownerId!: string;
  @IsDateString() dueDate!: string;
}

/**
 * Kullanıcının açıkça "bunu da gerçek envantere ekle" diye seçtiği (opt-in) her
 * hipotetik kontrol için gerçek Control şemasının zorunlu, simülasyonda hiç
 * tutulmayan alanları — simülasyonun P1/P2'sinden en-yakın-eşleme öneri olarak
 * sunulur (özellikle DÜZELTİCİ P2 → ControlNature'da karşılığı yoktur, bu yüzden
 * kullanıcı açıkça onaylamalı/değiştirmeli), ama nihai değeri kullanıcı seçer.
 * Seçilmeyen hipotetik kontroller aktarılmaz (senaryoda kalır, SKIP).
 */
export class NewControlAssignmentDto {
  @IsString() scenarioControlId!: string;
  @IsEnum(['BT', 'BT_DISI']) type!: 'BT' | 'BT_DISI';
  @IsEnum(['PREVENTIVE', 'DETECTIVE']) nature!: 'PREVENTIVE' | 'DETECTIVE';
  @IsEnum(['MANUAL', 'AUTOMATED', 'SEMI_AUTOMATED']) automation!: 'MANUAL' | 'AUTOMATED' | 'SEMI_AUTOMATED';
  @IsEnum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'AD_HOC'])
  frequency!: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL' | 'AD_HOC';
  @IsString() ownerId!: string;
  @IsOptional() @IsString() directorateId?: string;
}

/**
 * Aktarım önizleme ve uygulama, senaryonun O ANKİ contentVersion'ına karşı
 * doğrulanır — önizleme oluşturulduktan sonra kaynak/senaryo değiştiyse
 * apply reddedilir (409), kullanıcı yeni bir önizleme istemek zorunda kalır.
 */
export class TransferDto {
  @Type(() => Number)
  @IsInt()
  expectedContentVersion!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => NewRiskMetaDto)
  newRisk?: NewRiskMetaDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ActionAssignmentDto)
  actionAssignments?: ActionAssignmentDto[];

  /** Yalnızca kullanıcının açıkça seçtiği hipotetik kontroller — bkz. NewControlAssignmentDto. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NewControlAssignmentDto)
  newControlAssignments?: NewControlAssignmentDto[];

  /** Hedef riskin zaten onaylı bir artık risk değeri varsa ve aktarım bunu
   * değiştirecekse — preview bunu bir "onay gerektirir" durumu olarak işaretler
   * (hard block DEĞİL); apply yalnızca bu alan true ise devam eder. */
  @IsOptional()
  @IsBoolean()
  confirmResidualOverwrite?: boolean;
}
