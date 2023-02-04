from rest_framework import serializers

from .models import Comment, Issue, Member, Phase, Project, Status
from .services import effective_phases


class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ['key', 'name', 'created_at']
        read_only_fields = ['created_at']

    def validate_key(self, value):
        if self.instance is not None and value != self.instance.key:
            raise serializers.ValidationError('프로젝트 키는 바꿀 수 없습니다.')
        return value


class StatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Status
        fields = ['id', 'name', 'category', 'position']

    def validate_name(self, value):
        proejct = self.context['project']
        clash = proejct.statuses.filter(name=value)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError('이 프로젝트에 같은 이름의 상태가 이미 있습니다.')
        return value

    def create(self, validated_data):
        return Status.objects.create(project=self.context['project'], **validated_data)


class PhaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Phase
        fields = ['id', 'name', 'color', 'is_range', 'position']


class MemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = Member
        fields = ['id', 'name', 'email', 'position']


class ParentField(serializers.Field):
    """상위 이슈를 프로젝트 안의 이슈 번호로 읽고 쓰는 필드."""

    def to_representation(self, value):
        return value.number

    def to_internal_value(self, data):
        """번호로 상위 이슈를 찾고, 순환 구조가 되지 않는지 확인한다.

        Args:
            data: 요청으로 들어온 상위 이슈 번호.

        Returns:
            찾아낸 상위 이슈 객체.

        Raises:
            ValidationError: 이슈가 없거나, 자기 자신/하위 이슈 밑으로 옮기려 할 때.
        """
        try:
            parent = self.context['project'].issues.get(number=data)
        except (Issue.DoesNotExist, ValueError, TypeError):
            raise serializers.ValidationError('이 프로젝트에 해당 번호의 이슈가 없습니다.')
        issue = self.parent.instance
        node = parent
        # 위로 거슬러 올라가다 자기 자신을 만나면 순환이다. 이걸 막지 않으면 롤업이 무한 반복 된다.
        while issue is not None and node is not None:
            if node.pk == issue.pk:
                raise serializers.ValidationError('이슈를 자기 자신이나 자신의 하위 이슈 아래로 옮길 수 없습니다.')
            node = node.parent
        return parent


class IssueSerializer(serializers.ModelSerializer):
    ref = serializers.CharField(read_only=True)
    status = serializers.PrimaryKeyRelatedField(queryset=Status.objects.all(), required=False)
    parent = ParentField(required=False, allow_null=True)
    phases = serializers.SerializerMethodField()

    class Meta:
        model = Issue
        fields = [
            'ref', 'number', 'parent', 'title', 'description', 'status',
            'priority', 'issue_type', 'phases', 'created_at', 'updated_at',
        ]
        read_only_fields = ['number', 'created_at', 'updated_at']

    def get_phases(self, obj):
        """이슈의 단계별 일정 목록. 직접 정한 값과 하위 이슈에서 가져온 값이 섞여 있다."""
        effective = self.context.get('effective')
        if effective is None or obj.pk not in effective:
            effective = self.context['effective'] = effective_phases(self.context['project'])
        return [
            {
                'phase': phase_id,
                'start_date': item['start'],
                'end_date': item['end'],
                'source': item['source'],
                'selected': item['selected'],
                'assignees': item['assignees'],
            }
            for phase_id, item in sorted(effective.get(obj.pk, {}).items())
        ]

    def validate_status(self, value):
        if value.project_id != self.context['project'].pk:
            raise serializers.ValidationError('다른 프로젝트의 상태는 쓸 수 없습니다.')
        return value

    def create(self, validated_data):
        proejct = self.context['project']
        if 'status' not in validated_data:
            validated_data['status'] = proejct.statuses.first()
        return Issue.objects.create(
            project=proejct,
            number=proejct.next_issue_number(),
            **validated_data,
        )


class IssuePhaseSerializer(serializers.Serializer):
    """이슈의 단계 하나(일정과 담당자)를 입력받는다.

    보낸 항목만 바뀐다. 일정은 시작일만 줘도 되고(종료일은 시작일로 맞춘다), 둘 다 null 이면
    일정을 지운다. 하루짜리 단계는 항상 종료일을 시작일로 맞춘다.
    """

    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)
    assignees = serializers.PrimaryKeyRelatedField(many=True, queryset=Member.objects.all(), required=False)

    def validate(self, attrs):
        """일정 값을 맞추고 앞뒤가 뒤집히지 않았는지 확인한다.

        Args:
            attrs: 요청에서 받은 값. context 의 phase 는 단계, existing 은 이미 저장된 행(없으면 None)이다.

        Returns:
            바꿀 값만 담은 딕셔너리.

        Raises:
            ValidationError: 종료일이 시작일보다 빠를 때.
        """
        existing = self.context.get('existing')
        result = {}
        if 'assignees' in attrs:
            result['assignees'] = attrs['assignees']
        if 'start_date' in attrs or 'end_date' in attrs:
            start = attrs['start_date'] if 'start_date' in attrs else getattr(existing, 'start_date', None)
            end = attrs['end_date'] if 'end_date' in attrs else getattr(existing, 'end_date', None)
            if start is None:
                end = None
            elif end is None or not self.context['phase'].is_range:
                end = start
            if start is not None and end < start:
                raise serializers.ValidationError({'end_date': '종료일은 시작일보다 빠를 수 없습니다.'})
            result['start_date'], result['end_date'] = start, end
        return result


class CommentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comment
        fields = ['id', 'body', 'created_at']
        read_only_fields = ['created_at']

    def create(self, validated_data):
        return Comment.objects.create(issue=self.context['issue'], **validated_data)
