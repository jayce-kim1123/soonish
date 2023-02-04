from django.db import transaction
from django.db.models import Case, IntegerField, ProtectedError, Value, When
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Issue, IssuePhase, Member, Phase, Project, Status
from .serializers import (
    CommentSerializer,
    IssuePhaseSerializer,
    IssueSerializer,
    MemberSerializer,
    PhaseSerializer,
    ProjectSerializer,
    StatusSerializer,
)
from .services import effective_phases

DB_ORDERINGS = {'number', 'created_at', 'updated_at', 'title', 'priority'}
# 이슈의 일정(모든 단계를 통틀어 가장 이른 시작일 / 가장 늦은 종료일) 기준 정렬.
SCHEDULE_ORDERINGS = {'start', 'end'}
PRIORITY_RANK = {'low': 0, 'medium': 1, 'high': 2, 'urgent': 3}


class ProjectScopedMixin:
    """URL에 적힌 프로젝트를 찾아서 시리얼라이저에 넘겨 주는 믹스인."""

    def get_project(self):
        return get_object_or_404(Project, key=self.kwargs['key'])

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['project'] = self.get_project()
        return context


class ProjectList(generics.ListCreateAPIView):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer


class ProjectDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    lookup_field = 'key'


class StatusList(ProjectScopedMixin, generics.ListCreateAPIView):
    serializer_class = StatusSerializer

    def get_queryset(self):
        return self.get_project().statuses.all()


class StatusDetail(ProjectScopedMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = StatusSerializer

    def get_queryset(self):
        return self.get_project().statuses.all()

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {'detail': '이 상태를 쓰는 이슈가 있어 지울 수 없습니다.'},
                status=status.HTTP_409_CONFLICT,
            )


class PhaseList(generics.ListCreateAPIView):
    queryset = Phase.objects.all()
    serializer_class = PhaseSerializer


class PhaseDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Phase.objects.all()
    serializer_class = PhaseSerializer


class MemberList(generics.ListCreateAPIView):
    queryset = Member.objects.all()
    serializer_class = MemberSerializer


class MemberDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Member.objects.all()
    serializer_class = MemberSerializer


class IssueList(ProjectScopedMixin, generics.ListCreateAPIView):
    serializer_class = IssueSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['effective'] = effective_phases(context['project'])
        return context

    def get_queryset(self):
        queryset = self.get_project().issues.select_related('project', 'parent')
        params = self.request.query_params
        if 'status' in params:
            queryset = queryset.filter(status_id=params['status'])
        if 'priority' in params:
            queryset = queryset.filter(priority=params['priority'])
        if 'issue_type' in params:
            queryset = queryset.filter(issue_type=params['issue_type'])
        if params.get('q'):
            queryset = queryset.filter(title__icontains=params['q'])
        if 'assignee' in params:
            # 담당자가 한 단계라도 맡고 있는 이슈. 같은 이슈가 두 번 나오지 않도록 중복을 없앤다.
            queryset = queryset.filter(phases__assignees=params['assignee']).distinct()
        if 'parent' in params:
            if params['parent'] == 'none':
                queryset = queryset.filter(parent__isnull=True)
            else:
                queryset = queryset.filter(parent__number=params['parent'])
        return queryset

    def list(self, request, *args, **kwargs):
        """이슈 목록을 돌려준다.

        상태·우선순위·유형·검색어·상위 이슈는 DB에서 걸러 내고, 일정과 관련된 조건은
        하위 이슈에서 계산한 값이 필요해서 파이썬에서 처리한다.

        Query Args:
            overdue: 1이면 마감이 지났고 완료되지 않은 이슈만 돌려준다.
            from, to: 이 기간과 일정이 겹치는 이슈만 돌려준다 (YYYY-MM-DD).
            ordering: 정렬 기준. 앞에 -를 붙이면 내림차순이다.
        """
        params = request.query_params
        ordering = params.get('ordering', '-number')
        issues = self.order_in_db(self.get_queryset(), ordering)
        context = self.get_serializer_context()
        effective = context['effective']

        def span(issue):
            """이슈의 가장 이른 시작일과 가장 늦은 종료일. 일정이 없으면 (None, None)."""
            spans = [item for item in effective.get(issue.pk, {}).values() if item['start'] is not None]
            if not spans:
                return None, None
            return min(item['start'] for item in spans), max(item['end'] for item in spans)

        issues = list(issues)
        if params.get('overdue') == '1':
            today = timezone.localdate()
            issues = [
                i for i in issues
                if span(i)[1] is not None and span(i)[1] < today and i.status.category != Status.DONE
            ]
        if 'from' in params or 'to' in params:
            first, last = params.get('from'), params.get('to')
            issues = [
                i for i in issues
                if span(i)[0] is not None
                and (first is None or span(i)[1].isoformat() >= first)
                and (last is None or span(i)[0].isoformat() <= last)
            ]
        field = ordering.lstrip('-')
        if field in SCHEDULE_ORDERINGS:
            index = 0 if field == 'start' else 1
            dated = [i for i in issues if span(i)[index] is not None]
            undated = [i for i in issues if span(i)[index] is None]
            dated.sort(key=lambda i: (span(i)[index], i.number), reverse=ordering.startswith('-'))
            issues = dated + undated  # 일정이 없는 이슈는 항상 맨 뒤로 보낸다
        serializer = self.get_serializer(issues, many=True, context=context)
        return Response(serializer.data)

    @staticmethod
    def order_in_db(queryset, ordering):
        """DB 컬럼으로 정렬할 수 있는 기준이면 정렬한다. 왠만하면 여기서 끝내는게 빠르다.

        Args:
            queryset: 정렬할 이슈 쿼리셋.
            ordering: `ordering` 쿼리 값.

        Returns:
            정렬된 쿼리셋. 일정 기준 정렬은 이후 단계에서 하므로 그대로 돌려준다.
        """
        field = ordering.lstrip('-')
        if field not in DB_ORDERINGS:
            return queryset if field in SCHEDULE_ORDERINGS else queryset.order_by('-number')
        if field == 'priority':
            queryset = queryset.annotate(priority_rank=Case(
                *[When(priority=name, then=Value(rank)) for name, rank in PRIORITY_RANK.items()],
                output_field=IntegerField(),
            ))
            field = 'priority_rank'
        prefix = '-' if ordering.startswith('-') else ''
        return queryset.order_by(prefix + field, prefix + 'number')


class IssueDetail(ProjectScopedMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = IssueSerializer
    lookup_field = 'number'

    def get_queryset(self):
        return self.get_project().issues.select_related('project', 'parent')


class IssuePhaseDetail(ProjectScopedMixin, APIView):
    """이슈가 단계 하나를 고르거나 그 일정·담당자를 바꾸고(PUT), 단계를 뺀다(DELETE).

    PUT 은 보낸 항목만 바꾸며, 본문이 비어 있어도 단계를 고른 것으로 처리한다.
    단계를 빼면 일정과 담당자가 함께 지워지고, 상위 이슈는 다시 하위 이슈들의 일정을 따라간다.
    """

    def get_objects(self):
        issue = get_object_or_404(Issue, project=self.get_project(), number=self.kwargs['number'])
        return issue, get_object_or_404(Phase, pk=self.kwargs['phase'])

    def respond(self, issue):
        context = {'project': issue.project, 'request': self.request}
        return Response(IssueSerializer(issue, context=context).data)

    def put(self, request, **kwargs):
        issue, phase = self.get_objects()
        existing = IssuePhase.objects.filter(issue=issue, phase=phase).first()
        serializer = IssuePhaseSerializer(data=request.data, context={'phase': phase, 'existing': existing})
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        assignees = data.pop('assignees', None)
        with transaction.atomic():
            row, _ = IssuePhase.objects.update_or_create(issue=issue, phase=phase, defaults=data)
            if assignees is not None:
                row.assignees.set(assignees)
        return self.respond(issue)

    def delete(self, request, **kwargs):
        issue, phase = self.get_objects()
        IssuePhase.objects.filter(issue=issue, phase=phase).delete()
        return self.respond(issue)


class IssueScopedMixin(ProjectScopedMixin):
    def get_issue(self):
        return get_object_or_404(Issue, project=self.get_project(), number=self.kwargs['number'])

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['issue'] = self.get_issue()
        return context


class CommentList(IssueScopedMixin, generics.ListCreateAPIView):
    serializer_class = CommentSerializer

    def get_queryset(self):
        return self.get_issue().comments.all()


class CommentDetail(IssueScopedMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CommentSerializer

    def get_queryset(self):
        return self.get_issue().comments.all()
