from django.contrib import admin
from .models import Patient, Case, Image, Detection, Mask, Caption

admin.site.register(Patient)
admin.site.register(Case)
admin.site.register(Image)
admin.site.register(Detection)
admin.site.register(Mask)
admin.site.register(Caption)
