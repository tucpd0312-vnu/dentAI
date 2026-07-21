from django.db import models


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

    def __str__(self):
        return f"{self.key}={self.value}"
