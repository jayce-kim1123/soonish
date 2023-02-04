from django.core.validators import RegexValidator
from django.db import models, transaction
from django.db.models import F

# 새 프로젝트가 처음부터 가지는 상태 목록. 각 항목은 (이름, 분류) 이다.
defualt_statuses = [
    ('할 일', 'todo'),
    ('진행 중', 'doing'),
    ('완료', 'done'),
]


class Project(models.Model):
    """이슈를 담는 프로젝트.

    Attributes:
        key: 이슈 번호 앞에 붙는 영문 대문자 키 (예: WEB). 만든 뒤에는 바꿀 수 없다.
        name: 화면에 보이는 프로젝트 이름.
        issue_counter: 지금까지 발급한 이슈 번호의 마지막 값.
    """

    key = models.CharField(
        max_length=10,
        unique=True,
        validators=[RegexValidator(r'^[A-Z][A-Z0-9]{1,9}$', '키는 영문 대문자로 시작하는 2~10자의 대문자·숫자여야 합니다.')],
    )
    name = models.CharField(max_length=100)
    issue_counter = models.PositiveIntegerField(default=0, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['key']

    def __str__(self):
        return self.key

    def save(self, *args, **kwargs):
        """저장하고, 새 프로젝트라면 기본 상태를 함께 만든다."""
        adding = self._state.adding
        super().save(*args, **kwargs)
        if adding:
            for position, (name, category) in enumerate(defualt_statuses):
                Status.objects.create(project=self, name=name, category=category, position=position)

    def next_issue_number(self):
        """이 프로젝트의 다음 이슈 번호를 발급한다.

        하나의 트랜잭션 안에서 카운터를 올리기 때문에 동시에 요청이 와도 번호가 겹치치 않는다.

        Returns:
            새로 발급한 이슈 번호.
        """
        with transaction.atomic():
            Project.objects.filter(pk=self.pk).update(issue_counter=F('issue_counter') + 1)
            return Project.objects.values_list('issue_counter', flat=True).get(pk=self.pk)


class Status(models.Model):
    """프로젝트별 이슈 상태.

    Attributes:
        category: 상태의 분류. 진행률 계산과 마감 초과 판정에 쓰인다.
        position: 화면에 보이는 순서. 작을수록 앞이다.
    """

    TODO = 'todo'
    DOING = 'doing'
    DONE = 'done'
    CATEGORIES = [(TODO, '할 일'), (DOING, '진행 중'), (DONE, '완료')]

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
    """프로젝트 안의 이슈. 하위 이슈를 깊이 제한 없이 가질 수 있다.

    Attributes:
        parent: 상위 이슈. 최상위 이슈는 비어 있다. 상위 이슈를 지우면 하위 이슈도 함께 지워진다.
        number: 프로젝트 안에서의 이슈 번호. 한번 쓴 번호는 다시 쓰지 않는다.
    """

    PRIORITIES = [('low', '낮음'), ('medium', '보통'), ('high', '높음'), ('urgent', '긴급')]
    TYPES = [('task', '작업'), ('bug', '버그'), ('story', '스토리')]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='issues')
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.CASCADE, related_name='children')
    number = models.PositiveIntegerField(editable=False)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    status = models.ForeignKey(Status, on_delete=models.PROTECT, related_name='issues')
    priority = models.CharField(max_length=10, choices=PRIORITIES, default='medium')
    issue_type = models.CharField(max_length=10, choices=TYPES, default='task')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-number']
        constraints = [
            models.UniqueConstraint(fields=['project', 'number'], name='unique_issue_number_per_project'),
        ]

    def __str__(self):
        return f'{self.ref} {self.title}'

    @property
    def ref(self):
        """`WEB-1` 처럼 프로젝트 키와 번호를 붙인 이슈 표기."""
        return f'{self.project.key}-{self.number}'


class Comment(models.Model):
    """이슈에 달린 댓글."""

    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name='comments')
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']

    def __str__(self):
        return f'{self.issue.ref} comment {self.pk}'


class Phase(models.Model):
    """이슈를 진행하는 단계 (기획, 디자인, 개발, QA 등).

    모든 프로젝트와 이슈가 같은 단계 목록을 같이 쓰며, 사용자가 자유롭게 만들고 고치고 지울 수 있다.

    Attributes:
        color: 타임라인 막대에 칠하는 색. `#4a90e2` 형식이다.
        is_range: 참이면 시작일~종료일의 기간이고, 거짓이면 출시일 같은 하루짜리 날짜이다.
        position: 화면에 보이는 순서. 작을수록 앞이다.
    """

    name = models.CharField(max_length=50, unique=True)
    color = models.CharField(
        max_length=7,
        default='#4a90e2',
        validators=[RegexValidator(r'^#[0-9a-fA-F]{6}$', '색은 #4a90e2 같은 형식이어야 합니다.')],
    )
    is_range = models.BooleanField(default=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['position', 'id']

    def __str__(self):
        return self.name


class Member(models.Model):
    """이슈의 단계를 맡는 담당자.

    로그인은 없으므로 사람을 구분하는 이름표 역할만 한다.

    Attributes:
        name: 화면에 보이는 별칭.
        email: 연락용 이메일 (선택).
        position: 직무나 포지션 (선택). 예: 기획자, 디자이너.
    """

    name = models.CharField(max_length=50, unique=True)
    email = models.EmailField(blank=True)
    position = models.CharField(max_length=50, blank=True)

    class Meta:
        ordering = ['name', 'id']

    def __str__(self):
        return self.name


class IssuePhase(models.Model):
    """이슈가 고른 단계 하나와 그 단계의 일정·담당자.

    이슈는 쓰고 싶은 단계만 골라서 이 행을 만든다. 일정은 비워 둘 수 있고, 비어 있으면 하위 이슈들의
    같은 단계 일정을 따라간다 (services.effective_phases 참고).

    Attributes:
        start_date: 단계 시작일. 일정이 없으면 비어 있다.
        end_date: 단계 종료일. 하루짜리 단계는 시작일과 같다.
        assignees: 이 단계를 맡은 담당자들. 여러 명이 될 수 있다.
    """

    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name='phases')
    phase = models.ForeignKey(Phase, on_delete=models.CASCADE, related_name='issue_phases')
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    assignees = models.ManyToManyField(Member, blank=True, related_name='issue_phases')

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['issue', 'phase'], name='unique_issue_phase'),
            models.CheckConstraint(
                check=(
                    models.Q(start_date__isnull=True, end_date__isnull=True)
                    | models.Q(start_date__isnull=False, end_date__isnull=False, end_date__gte=models.F('start_date'))
                ),
                name='issue_phase_dates_valid',
            ),
        ]
