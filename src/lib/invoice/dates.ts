/**
 * Keep the due date coupled to the issue date until the person deliberately
 * edits the due date. If both dates still match, they are also treated as
 * coupled so an issue-date edit keeps the two dates together.
 */
export function syncDueDateWithIssueDate(
  currentIssueDate: string,
  currentDueDate: string,
  nextIssueDate: string,
  dueDateEdited: boolean,
): string {
  return !dueDateEdited || currentDueDate === currentIssueDate
    ? nextIssueDate
    : currentDueDate;
}
