from rest_framework import serializers

from .models import Comment, Issue, Project, Status


class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = ['key', 'name', 'created_at']
        read_only_fields = ['created_at']

    def validate_key(self, value):
        if self.instance is not None and value != self.instance.key:
            raise serializers.ValidationError('The key of a project cannot be changed.')
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
            raise serializers.ValidationError('This project already has a status with that name.')
        return value

    def create(self, validated_data):
        return Status.objects.create(project=self.context['project'], **validated_data)


class IssueSerializer(serializers.ModelSerializer):
    ref = serializers.CharField(read_only=True)
    status = serializers.PrimaryKeyRelatedField(queryset=Status.objects.all(), required=False)

    class Meta:
        model = Issue
        fields = [
            'ref', 'number', 'title', 'description', 'status',
            'priority', 'issue_type', 'start_date', 'due_date', 'created_at', 'updated_at',
        ]
        read_only_fields = ['number', 'created_at', 'updated_at']

    def validate_status(self, value):
        if value.project_id != self.context['project'].pk:
            raise serializers.ValidationError('The status belongs to another project.')
        return value

    def validate(self, attrs):
        start = attrs.get('start_date', self.instance.start_date if self.instance else None)
        due = attrs.get('due_date', self.instance.due_date if self.instance else None)
        if start and due and due < start:
            raise serializers.ValidationError({'due_date': 'The due date cannot be before the start date.'})
        return attrs

    def create(self, validated_data):
        proejct = self.context['project']
        if 'status' not in validated_data:
            validated_data['status'] = proejct.statuses.first()
        return Issue.objects.create(
            project=proejct,
            number=proejct.next_issue_number(),
            **validated_data,
        )


class CommentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comment
        fields = ['id', 'body', 'created_at']
        read_only_fields = ['created_at']

    def create(self, validated_data):
        return Comment.objects.create(issue=self.context['issue'], **validated_data)
