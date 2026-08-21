/* ============================================
   UI COMPONENT LIBRARY — Barrel Export
   Quaresma + Aboubakar
   ============================================ */

// Core
export { Button } from './Button';
export { StatusBadge, getSeverityVariant, getStatusVariant } from './StatusBadge';
export { Input, Textarea, Select } from './Input';

// Layout
export { PageShell } from './PageShell';
export { PageHeader } from './PageHeader';
export { Tabs } from './Tabs';
export { FilterBar } from './FilterBar';
export type { FilterConfig, FilterOption } from './FilterBar';
export { DetailShell, DetailHeader, DetailSection } from './DetailShell';

// KPI
export { KpiCard, KpiGrid } from './KpiCard';
export type { KpiVariant, KpiCardProps } from './KpiCard';

// Filters (Design System v2)
export { QuickFilterBar } from './QuickFilterBar';
export type { QuickFilterItem } from './QuickFilterBar';
export { AdvancedFilterPanel } from './AdvancedFilterPanel';
export type { AdvancedFilterField, AdvancedFilterOption } from './AdvancedFilterPanel';
export { ActiveFilterChips } from './ActiveFilterChips';
export type { ActiveFilterChip } from './ActiveFilterChips';

// Data Display
export { DataTable } from './DataTable';
export type { ColumnDef, ColumnFilter, TableDensity } from './DataTable';
export { FileUpload } from './FileUpload';
export type { AttachmentMeta } from './FileUpload';
export { SavedViewMenu, loadSavedViews } from './SavedViewMenu';
export type { SavedView } from './SavedViewMenu';
export { RelationshipLink } from './RelationshipLink';
export type { RelatedEntityType } from './RelationshipLink';
export { Timeline } from './Timeline';
export type { TimelineItem, TimelineVariant } from './Timeline';

// Overlay
export { Modal } from './Modal';
export { ConfirmDialog } from './ConfirmDialog';
export { DetailDrawer } from './DetailDrawer';

// Feedback
export { EmptyState } from './EmptyState';
export { LoadingState } from './LoadingState';
export { ErrorState } from './ErrorState';
