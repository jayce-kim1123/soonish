from django.db.models import Case, F, IntegerField, ProtectedError, Value, When
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.response import Response

from .models import Issue, Project, Status
from .serializers import CommentSerializer, IssueSerializer, ProjectSerializer, StatusSerializer


ISSUE_ORDERINGS = {'number', 'created_at', 'updated_at', 'title', 'priority', 'start_date', 'due_date'}
PRIORITY_RANK = {'low': 0, 'medium': 1, 'high': 2, 'urgent': 3}


class ProjectScopedMixin:
    """Resolves the project named in the URL and hands it to the serializer."""

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
                {'detail': 'Issues still use this status.'},
                status=status.HTTP_409_CONFLICT,
            )


class IssueList(ProjectScopedMixin, generics.ListCreateAPIView):
    serializer_class = IssueSerializer

    def get_queryset(self):
        queryset = self.get_project().issues.select_related('project')
        params = self.request.query_params
        if 'status' in params:
            queryset = queryset.filter(status_id=params['status'])
        if 'priority' in params:
            queryset = queryset.filter(priority=params['priority'])
        if 'issue_type' in params:
            queryset = queryset.filter(issue_type=params['issue_type'])
        if params.get('q'):
            queryset = queryset.filter(title__icontains=params['q'])
        queryset = self.filter_schedule(queryset, params)
        return self.order(queryset, params.get('ordering', '-number'))

    @staticmethod
    def filter_schedule(queryset, params):
        """Schedule filters: `overdue`, and `from`/`to` for issues whose start-to-due span overlaps a date range."""
        if params.get('overdue') == '1':
            queryset = queryset.filter(due_date__lt=timezone.localdate()).exclude(status__category='done')
        if 'from' in params or 'to' in params:
            queryset = queryset.annotate(
                span_start=Coalesce('start_date', 'due_date'),
                span_end=Coalesce('due_date', 'start_date'),
            ).filter(span_start__isnull=False)
            if 'from' in params:
                queryset = queryset.filter(span_end__gte=params['from'])
            if 'to' in params:
                queryset = queryset.filter(span_start__lte=params['to'])
        return queryset

    @staticmethod
    def order(queryset, ordering):
        field = ordering.lstrip('-')
        if field not in ISSUE_ORDERINGS:
            return queryset
        if field == 'priority':
            queryset = queryset.annotate(priority_rank=Case(
                *[When(priority=name, then=Value(rank)) for name, rank in PRIORITY_RANK.items()],
                output_field=IntegerField(),
            ))
            field = 'priority_rank'
        descending = ordering.startswith('-')
        if field in ('start_date', 'due_date'):
            # Issues without a date always come last.
            expression = F(field).desc(nulls_last=True) if descending else F(field).asc(nulls_last=True)
            return queryset.order_by(expression, 'number')
        prefix = '-' if descending else ''
        return queryset.order_by(prefix + field, prefix + 'number')


class IssueDetail(ProjectScopedMixin, generics.RetrieveUpdateDestroyAPIView):
    serializer_class = IssueSerializer
    lookup_field = 'number'

    def get_queryset(self):
        return self.get_project().issues.select_related('project')


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
