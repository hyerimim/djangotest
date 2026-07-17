from django.urls import path

from . import views

app_name = 'habits'

urlpatterns = [
    path('', views.dashboard, name='dashboard'),
    path('create/', views.habit_create, name='habit_create'),
    path('<int:pk>/delete/', views.habit_delete, name='habit_delete'),
    path('<int:pk>/toggle/', views.habit_toggle, name='habit_toggle'),
]
