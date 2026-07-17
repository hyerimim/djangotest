from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User
from django import forms

from .models import Habit


class SignUpForm(UserCreationForm):
    class Meta:
        model = User
        fields = ('username',)


class HabitForm(forms.ModelForm):
    class Meta:
        model = Habit
        fields = ('name', 'color')
        widgets = {
            'name': forms.TextInput(attrs={'placeholder': '예: 물 2L 마시기'}),
        }
