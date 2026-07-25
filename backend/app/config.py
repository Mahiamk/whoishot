from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict



class Settings(BaseSettings):
    # extra="ignore": .env may carry keys not (yet) modeled here — tolerate
    # them instead of refusing to boot.
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    DATABASE_URL: str = "sqlite:///./whoishot.db"
    JWT_SECRET: str = "change-me-in-production"
    CORS_ORIGINS: str = "http://localhost:5173"
    ADMIN_EMAIL: str | None = None
    FRONTEND_URL: str = "http://localhost:5173"

    # Google sign-in (OAuth Web client ID from Google Cloud Console).
    # Unset = the /auth/google endpoint responds 503 and the frontend
    # hides its "Continue with Google" button.
    GOOGLE_CLIENT_ID: str | None = None

    # Resend email API configuration (supports RESEND_API_KEY or RESEND_API)
    RESEND_API_KEY: str | None = Field(
        default=None, validation_alias=AliasChoices("RESEND_API_KEY", "RESEND_API")
    )
    RESEND_FROM_EMAIL: str = "WhoIsHot <onboarding@resend.dev>"



    # SMTP is optional: unset in dev, emails are logged to the console instead.
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM: str = "no-reply@whoishot.local"


    # Monetization — social links subscription
    SUBSCRIPTION_PRICE_CENTS: int = 900   # RM 9.00
    SUBSCRIPTION_CURRENCY: str = "MYR"
    # Set to True to enable the mock payment provider (no real money moves).
    # In production, flip to False and wire real providers in Step 22.
    MOCK_PAYMENT: bool = True
    # HMAC secret used to verify webhook signatures. In dev the mock provider
    # skips verification; set a real secret for each real provider in prod.
    SUBSCRIPTION_WEBHOOK_SECRET: str = "dev-secret"

    # Payment provider credentials (MYR - Curlec / Touch 'n Go)
    CURLEC_KEY_ID: str | None = None
    CURLEC_KEY_SECRET: str | None = None
    CURLEC_WEBHOOK_SECRET: str | None = None
    TNG_API_KEY: str | None = None
    TNG_MERCHANT_ID: str | None = None
    TNG_API_URL: str = "https://api.tngdigital.com.my"

    # Payment provider credentials (ETB - Chapa / BirrJS)
    CHAPA_SECRET_KEY: str | None = None
    CHAPA_PUBLIC_KEY: str | None = None
    CHAPA_WEBHOOK_SECRET: str | None = None
    CHAPA_API_URL: str = "https://api.chapa.co/v1"


    # Manual payment destinations (bank / TnG transfer details)
    MANUAL_PAYMENT_INFO: str = '{"bank_name": "Maybank", "account_no": "1234-5678-9012", "account_name": "WhoIsHot Inc", "tng_number": "+60 12-345 6789"}'

    @property
    def manual_payment_info_dict(self) -> dict[str, str]:
        import json
        try:
            return json.loads(self.MANUAL_PAYMENT_INFO)
        except Exception:
            return {
                "bank_name": "Maybank",
                "account_no": "1234-5678-9012",
                "account_name": "WhoIsHot Inc",
                "tng_number": "+60 12-345 6789",
            }

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]



@lru_cache
def get_settings() -> Settings:
    return Settings()
