from django.urls import path

from . import views

urlpatterns = [
    path('members/', views.MemberList.as_view()),
    path('members/<int:pk>/', views.MemberDetail.as_view()),
    path('phases/', views.PhaseList.as_view()),
    path('phases/<int:pk>/', views.PhaseDetail.as_view()),
    path('projects/', views.ProjectList.as_view()),
    path('projects/<str:key>/', views.ProjectDetail.as_view()),
    path('projects/<str:key>/statuses/', views.StatusList.as_view()),
    path('projects/<str:key>/statuses/<int:pk>/', views.StatusDetail.as_view()),
    path('projects/<str:key>/issues/', views.IssueList.as_view()),
    path('projects/<str:key>/issues/<int:number>/', views.IssueDetail.as_view()),
    path('projects/<str:key>/issues/<int:number>/phases/<int:phase>/', views.IssuePhaseDetail.as_view()),
    path('projects/<str:key>/issues/<int:number>/comments/', views.CommentList.as_view()),
    path('projects/<str:key>/issues/<int:number>/comments/<int:pk>/', views.CommentDetail.as_view()),
]
