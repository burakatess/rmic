import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnnualPlanAssignmentDecisions, hasUnresolvedPlanConflicts } from '@/components/controls/AnnualPlanAssignmentDecisions';
import type { AnnualPlanPreview, AnnualPlanAssignmentDecision } from '@/types/annual-plan';

const preview: AnnualPlanPreview = {
    toAdd: [], toRemove: [], toModify: [], missingSchedule: [], assignmentBlocked: [], blocked: true,
    taskSummary: { toCreate: 0, toCancel: 0, protectedCount: 0 },
    conflicts: [{ type: 'ASSIGNMENT', controlId: 'c1', controlCode: 'C1', name: 'Control', reason: '',
        assigneeName: 'New First', secondControllerName: 'New Second',
        ongoingTasks: [
            { id: 't1', testNo: 'T1', status: 'DEVAM_EDIYOR', assigneeName: 'Old First', secondControllerName: 'Old Second' },
            { id: 't2', testNo: 'T2', status: 'TAMAMLANDI' },
        ],
    }],
};

it('requires each explicit decision, shows old/new controllers, and submits mixed choices', () => {
    const submit = jest.fn();
    function Harness() {
        const [decisions, setDecisions] = useState<AnnualPlanAssignmentDecision[]>([]);
        return <>
            <AnnualPlanAssignmentDecisions preview={preview} decisions={decisions} onChange={setDecisions} disabled={false} />
            <button disabled={hasUnresolvedPlanConflicts(preview, decisions)} onClick={() => submit(decisions)}>Uygula</button>
        </>;
    }
    render(<Harness />);
    expect(screen.getByText(/Plandaki kontrolcü: New First/)).toBeInTheDocument();
    expect(screen.getByText(/Mevcut kontrolcü: Old First/)).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('T1 atama kararı'), { target: { value: 'KEEP' } });
    expect(screen.getByRole('button')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('T2 atama kararı'), { target: { value: 'REASSIGN' } });
    expect(screen.getByRole('button')).toBeEnabled();
    fireEvent.click(screen.getByRole('button'));
    expect(submit).toHaveBeenCalledWith([
        { controlId: 'c1', taskId: 't1', action: 'KEEP' }, { controlId: 'c1', taskId: 't2', action: 'REASSIGN' },
    ]);
    fireEvent.change(screen.getByLabelText('T1 atama kararı'), { target: { value: '' } });
    expect(screen.getByRole('button')).toBeDisabled();
});

it('keeps unrelated blockers and missing assignments blocked', () => {
    expect(hasUnresolvedPlanConflicts({ ...preview, conflicts: [{ ...preview.conflicts[0], type: 'SCOPE_REMOVAL' }] }, [])).toBe(true);
    expect(hasUnresolvedPlanConflicts({ ...preview, conflicts: [], assignmentBlocked: [{ controlId: 'c1', controlCode: 'C1', name: 'Control' }] }, [])).toBe(true);
});

it('disables decision editing while applying', () => {
    render(<AnnualPlanAssignmentDecisions preview={preview} decisions={[]} onChange={jest.fn()} disabled />);
    expect(screen.getByLabelText('T1 atama kararı')).toBeDisabled();
});
