/**
 * class-validator/class-transformer DTO'larında kullanılan enum listeleri —
 * calculation-engine.ts'teki P1-P5/ImpactArea/FinalImpactChoice tipleriyle
 * birebir aynı değer kümesi (motorla senkron tutulmalı).
 */

export const SIM_P1_VALUES = ['MANUEL', 'BT_MANUEL', 'OTOMATIK'] as const;
export const SIM_P2_VALUES = ['TESPIT_EDICI', 'DUZELTICI', 'ONLEYICI'] as const;
export const SIM_P3_VALUES = ['IZ_KAYDI_YOK', 'KULLANICI_SIFRE_SES_EMAIL', 'SISTEM_LOG_ISLAK_IMZA', 'ELEKTRONIK_IMZA'] as const;
export const SIM_P4_VALUES = ['YOK', 'AYNI_EKIP', 'FARKLI_EKIP', 'HER_IKISI'] as const;
export const SIM_P5_VALUES = ['YOK', 'DUZENSIZ_UST_AMIR', 'DUZENLI_UST_AMIR', 'FARKLI_BIRIM_GOZETIM'] as const;
export const SIM_IMPACT_AREA_VALUES = ['PROBABILITY', 'IMPACT', 'BOTH'] as const;
export const SIM_FINAL_IMPACT_CHOICE_VALUES = ['BUSINESS', 'INFOSEC'] as const;
export const SIM_KTS_MODE_VALUES = ['FROM_TEST', 'MANUAL'] as const;
export const SIM_ACTION_EFFECT_MODE_VALUES = ['P1P5_KTS', 'TARGET_KEP'] as const;
export const SIM_SCENARIO_SOURCE_TYPE_VALUES = ['EXISTING_RISK', 'HYPOTHETICAL'] as const;
export const SIM_STATUS_VALUES = ['ACTIVE', 'ARCHIVED'] as const;
