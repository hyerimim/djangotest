import datetime

from django.conf import settings
from django.db import models


class Habit(models.Model):
    COLOR_CHOICES = [
        ('#4f46e5', '인디고'),
        ('#059669', '그린'),
        ('#dc2626', '레드'),
        ('#d97706', '오렌지'),
        ('#0891b2', '시안'),
    ]

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='habits'
    )
    name = models.CharField('습관 이름', max_length=100)
    color = models.CharField(max_length=7, choices=COLOR_CHOICES, default='#4f46e5')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return self.name

    def is_done_on(self, date):
        return self.logs.filter(date=date, done=True).exists()

    @property
    def current_streak(self):
        streak = 0
        day = datetime.date.today()
        done_dates = set(
            self.logs.filter(done=True).values_list('date', flat=True)
        )
        while day in done_dates:
            streak += 1
            day -= datetime.timedelta(days=1)
        return streak


class HabitLog(models.Model):
    habit = models.ForeignKey(Habit, on_delete=models.CASCADE, related_name='logs')
    date = models.DateField(default=datetime.date.today)
    done = models.BooleanField(default=True)

    class Meta:
        unique_together = ('habit', 'date')
        ordering = ['-date']

    def __str__(self):
        return f'{self.habit.name} - {self.date}'
