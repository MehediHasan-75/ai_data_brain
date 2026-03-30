from django.db import models
from django.contrib.auth.models import User


class UserProfileManager(models.Manager):
    def get_or_create_for_user(self, user):
        profile, _ = self.get_or_create(user=user)
        return profile

    def get_friends(self, user):
        """Return combined list of friends (bidirectional: added by user + added user)."""
        try:
            profile = self.get(user=user)
            user_friends = list(profile.friends.all())
        except self.model.DoesNotExist:
            user_friends = []

        friends_who_added_me = list(User.objects.filter(profile__friends=user))

        seen_ids = {u.id for u in user_friends}
        for f in friends_who_added_me:
            if f.id not in seen_ids:
                user_friends.append(f)
                seen_ids.add(f.id)

        return user_friends
