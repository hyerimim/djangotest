import datetime

from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.generic import CreateView

from .forms import HabitForm, SignUpForm
from .models import Habit


class SignUpView(CreateView):
    form_class = SignUpForm
    template_name = 'registration/signup.html'
    success_url = '/'

    def form_valid(self, form):
        response = super().form_valid(form)
        login(self.request, self.object)
        return response


@login_required
def dashboard(request):
    today = datetime.date.today()
    week = [today - datetime.timedelta(days=i) for i in range(6, -1, -1)]

    habits = request.user.habits.prefetch_related('logs')
    rows = []
    for habit in habits:
        done_dates = set(habit.logs.filter(done=True).values_list('date', flat=True))
        rows.append({
            'habit': habit,
            'days': [{'date': day, 'done': day in done_dates} for day in week],
            'today_done': today in done_dates,
            'streak': habit.current_streak,
        })

    context = {'rows': rows, 'week': week, 'today': today, 'form': HabitForm()}
    return render(request, 'habits/dashboard.html', context)


@login_required
def habit_create(request):
    if request.method == 'POST':
        form = HabitForm(request.POST)
        if form.is_valid():
            habit = form.save(commit=False)
            habit.owner = request.user
            habit.save()
    return redirect('habits:dashboard')


@login_required
def habit_delete(request, pk):
    habit = get_object_or_404(Habit, pk=pk, owner=request.user)
    if request.method == 'POST':
        habit.delete()
    return redirect('habits:dashboard')


@login_required
def habit_toggle(request, pk):
    habit = get_object_or_404(Habit, pk=pk, owner=request.user)
    date_str = request.POST.get('date')
    date = datetime.date.fromisoformat(date_str) if date_str else datetime.date.today()

    log = habit.logs.filter(date=date).first()
    if log:
        log.delete()
        done = False
    else:
        habit.logs.create(date=date, done=True)
        done = True

    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        return JsonResponse({'done': done, 'streak': habit.current_streak})
    return redirect('habits:dashboard')
