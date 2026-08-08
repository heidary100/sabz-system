$repo="heidary100/sabz-system"

$labels=@(
    @{name="type:feature";color="0E8A16";description="New feature"},
    @{name="type:bug";color="D73A4A";description="Bug fix"},
    @{name="type:tech-debt";color="FBCA04";description="Technical debt"},
    @{name="type:documentation";color="0075CA";description="Documentation"},

    @{name="area:backend";color="1D76DB";description="NestJS backend"},
    @{name="area:admin";color="5319E7";description="Admin panel"},
    @{name="area:storefront";color="B60205";description="Customer storefront"},
    @{name="area:database";color="006B75";description="Database work"},
    @{name="area:devops";color="C2E0C6";description="Infrastructure"},
    @{name="area:security";color="E99695";description="Security"},

    @{name="priority:critical";color="B60205";description="Critical"},
    @{name="priority:high";color="D93F0B";description="High"},
    @{name="priority:medium";color="FBCA04";description="Medium"},
    @{name="priority:low";color="0E8A16";description="Low"},

    @{name="sprint:0";color="C5DEF5";description="Sprint 0"},
    @{name="sprint:1";color="C5DEF5";description="Sprint 1"},
    @{name="sprint:2";color="C5DEF5";description="Sprint 2"},
    @{name="sprint:3";color="C5DEF5";description="Sprint 3"},
    @{name="sprint:4";color="C5DEF5";description="Sprint 4"},
    @{name="sprint:5";color="C5DEF5";description="Sprint 5"},

    @{name="status:blocked";color="000000";description="Blocked"}
)

foreach($label in $labels){

    gh label create $label.name `
    --repo $repo `
    --color $label.color `
    --description $label.description `
    --force

    Write-Host "Created $($label.name)"
}