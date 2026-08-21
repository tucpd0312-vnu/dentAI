from django.contrib import admin

from .models import Scan, ScanAccessToken, Segmentation

admin.site.register(Scan)
admin.site.register(ScanAccessToken)
admin.site.register(Segmentation)
