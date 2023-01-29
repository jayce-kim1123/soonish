from django.core.validators import RegexValidator
from django.db import models, transaction
from django.db.models import F

# (name, category) of the statuses every new project starts with.
defualt_statuses = [
    ('To Do', 'todo'),
    ('In Progress', 'doing'),
    ('Done', 'done'),
]


class Project(models.Model):
    key = models.CharField(
        max_length=10,
        unique=True,
        validators=[RegexValidator(r'^[A-Z][A-Z0-9]{1,9}$', 'Use 2-10 upper-case letters or digits, starting with a letter.')],
    )
    name = models.CharField(max_length=100)
    issue_counter = models.PositiveIntegerField(default=0, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['key']

    def __str__(self):
        return self.key

    def save(self, *args, **kwargs):
        adding = self._state.adding
        super().save(*args, **kwargs)
        if adding:
            for position, (name, category) in enumerate(defualt_statuses):
                Status.objects.create(project=self, name=name, category=category, position=position)

    def next_issue_number(self):
        """Reserve the next issue number of this project."""
        with transaction.atomic():
            Project.objects.filter(pk=self.pk).update(issue_counter=F('issue_counter') + 1)
            return Project.objects.values_list('issue_counter', flat=True).get(pk=self.pk)


class Status(models.Model):
    TODO = 'todo'
    DOING = 'doing'
    DONE = 'done'
    CATEGORIES = [(TODO, 'To do'), (DOING, 'In progress'), (DONE, 'Done')]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='statuses')
    name = models.CharField(max_length=50)
    category = models.CharField(max_length=10, choices=CATEGORIES, default=TODO)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['position', 'id']
        verbose_name_plural = 'statuses'
        constraints = [
            models.UniqueConstraint(fields=['project', 'name'], name='unique_status_name_per_project'),
        ]

    def __str__(self):
        return f'{self.project.key}: {self.name}'


class Issue(models.Model):
    PRIORITIES = [('low', 'Low'), ('medium', 'Medium'), ('high', 'High'), ('urgent', 'Urgent')]
    TYPES = [('task', 'Task'), ('bug', 'Bug'), ('story', 'Story')]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='issues')
    number = models.PositiveIntegerField(editable=False)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    status = models.ForeignKey(Status, on_delete=models.PROTECT, related_name='issues')
    priority = models.CharField(max_length=10, choices=PRIORITIES, default='medium')
    issue_type = models.CharField(max_length=10, choices=TYPES, default='task')
    start_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-number']
        constraints = [
            models.UniqueConstraint(fields=['project', 'number'], name='unique_issue_number_per_project'),
            models.CheckConstraint(
                check=models.Q(start_date__isnull=True) | models.Q(due_date__isnull=True) | models.Q(due_date__gte=models.F('start_date')),
                name='issue_due_date_not_before_start_date',
            ),
        ]

    def __str__(self):
        return f'{self.ref} {self.title}'

    @property
    def ref(self):
        return f'{self.project.key}-{self.number}'


class Comment(models.Model):
    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name='comments')
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']

    def __str__(self):
        return f'{self.issue.ref} comment {self.pk}'
