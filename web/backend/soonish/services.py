from collections import defaultdict

from .models import IssuePhase


def effective_phases(project):
    """프로젝트 이슈들의 단계별 일정과 담당자를 계산한다.

    이슈가 단계를 직접 골랐고 일정도 정했으면('own') 그 일정을 쓴다. 일정이 없으면 하위 이슈들의
    같은 단계에서 가장 이른 시작일과 가장 늦은 종료일을 가져온다('rollup'). 하위 이슈는 몇 단계
    아래든 포함한다. 담당자는 이슈가 직접 고른 단계에만 있고 상위로 올라가지 않는다.

    Args:
        project: 계산할 대상 프로젝트.

    Returns:
        이슈 id, 단계 id 순으로 찾는 딕셔너리. 값은 아래 키를 가진 딕셔너리이다.
        start, end (일정이 없으면 None), source ('own', 'rollup', 'none'),
        selected (이슈가 직접 고른 단계인지), assignees (담당자 id 목록).
        단계를 고르지도 않았고 하위 이슈에도 일정이 없는 이슈는 키가 없을 수도 있다.
    """
    children = defaultdict(list)
    for issue_id, parent_id in project.issues.values_list('id', 'parent_id'):
        children[parent_id].append(issue_id)
    own = defaultdict(dict)
    rows = IssuePhase.objects.filter(issue__project=project).prefetch_related('assignees')
    for row in rows:
        own[row.issue_id][row.phase_id] = (row.start_date, row.end_date, sorted(a.id for a in row.assignees.all()))

    result = {}

    def compute(issue_id):
        if issue_id in result:
            return result[issue_id]
        spans = {}
        for child in children.get(issue_id, []):
            for phase_id, item in compute(child).items():
                if item['start'] is None:
                    continue
                if phase_id in spans:
                    spans[phase_id] = (min(spans[phase_id][0], item['start']), max(spans[phase_id][1], item['end']))
                else:
                    spans[phase_id] = (item['start'], item['end'])
        merged = {
            phase_id: {'start': start, 'end': end, 'source': 'rollup', 'selected': False, 'assignees': []}
            for phase_id, (start, end) in spans.items()
        }
        for phase_id, (start, end, assignees) in own[issue_id].items():
            if start is not None:
                merged[phase_id] = {'start': start, 'end': end, 'source': 'own', 'selected': True, 'assignees': assignees}
            elif phase_id in merged:
                merged[phase_id].update(selected=True, assignees=assignees)
            else:
                merged[phase_id] = {'start': None, 'end': None, 'source': 'none', 'selected': True, 'assignees': assignees}
        result[issue_id] = merged
        return merged

    for issue_id in [i for ids in children.values() for i in ids]:
        compute(issue_id)
    return result
