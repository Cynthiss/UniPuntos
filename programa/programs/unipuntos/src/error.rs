use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Solo la autoridad de la universidad puede hacer esto")]
    Unauthorized,
    #[msg("La cantidad debe ser mayor que 0")]
    InvalidAmount,
    #[msg("La duración del período debe ser mayor que 0")]
    InvalidPeriod,
    #[msg("El estudiante superaría el tope de puntos de este período")]
    StudentCapExceeded,
    #[msg("Se superaría el presupuesto de puntos de este período")]
    BudgetExceeded,
    #[msg("El comercio no está activo")]
    MerchantInactive,
    #[msg("El texto supera el largo máximo permitido")]
    TextTooLong,
    #[msg("Desbordamiento aritmético")]
    Overflow,
}
