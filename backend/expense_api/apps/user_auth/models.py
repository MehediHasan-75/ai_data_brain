from django.db import models
from django.contrib.auth.models import User

from .managers import UserProfileManager


class UserProfile(models.Model):
    objects = UserProfileManager()

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    friends = models.ManyToManyField(User, related_name='friends', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username}'s profile"
