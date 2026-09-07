import { Transform } from 'class-transformer';

/**
 * HTML <input type="date"> (ve benzeri) alanlar boş bırakıldığında '' gönderir.
 * class-validator'ın @IsOptional()'ı yalnızca undefined/null değerini atlar,
 * boş string'i atlamaz — bu da @IsDateString() gibi validator'ların boş string'i
 * geçersiz veri olarak reddetmesine yol açar. Bu dekoratör, boş string'i
 * undefined'a çevirerek @IsOptional()'ın devreye girmesini sağlar.
 *
 * Kullanım: @IsOptional() @EmptyToUndefined() @IsDateString() alan?: string;
 */
export const EmptyToUndefined = () =>
    Transform(({ value }) => (value === '' ? undefined : value));
