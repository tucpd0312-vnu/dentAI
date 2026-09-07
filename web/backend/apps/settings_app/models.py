from django.db import models


CONFIDENCE_THRESHOLD_KEY = "confidence_threshold"
DEFAULT_CONFIDENCE_THRESHOLD = 0.5


class AppSettings(models.Model):
    key = models.CharField(max_length=64, unique=True)
    value = models.CharField(max_length=256)

    class Meta:
        verbose_name_plural = "App settings"

    @classmethod
    def get(cls, key: str, default=None):
        try:
            return cls.objects.get(key=key).value
        except cls.DoesNotExist:
            return default

    @classmethod
    def set(cls, key: str, value: str):
        cls.objects.update_or_create(key=key, defaults={"value": str(value)})

    @classmethod
    def confidence_threshold(cls) -> float:
        """Return the validated global confidence threshold used for new cases."""
        value = cls.get(CONFIDENCE_THRESHOLD_KEY, DEFAULT_CONFIDENCE_THRESHOLD)
        try:
            threshold = float(value)
        except (TypeError, ValueError):
            return DEFAULT_CONFIDENCE_THRESHOLD
        if not 0.0 <= threshold <= 1.0:
            return DEFAULT_CONFIDENCE_THRESHOLD
        return threshold

    def __str__(self):
        return f"{self.key}={self.value}"
