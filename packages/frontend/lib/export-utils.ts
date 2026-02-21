import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Export Analytics Dashboard to CSV
 */
export function exportAnalyticsToCsv(data: {
  queryPerf: any;
  sharedDatasets: any;
  dataFreshness: any;
  connectionHealth: any;
}) {
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `datagate-analytics-${timestamp}.csv`;

  let csv = 'DataGate Analytics Report\n';
  csv += `Generated: ${new Date().toLocaleString()}\n\n`;

  // Query Performance Section
  csv += '=== QUERY PERFORMANCE ===\n';
  csv += `Average Execution Time,${data.queryPerf?.avgExecutionTimeMs || 0} ms\n`;
  csv += `Total Queries,${data.queryPerf?.totalQueries || 0}\n`;
  csv += `Failed Queries,${data.queryPerf?.failedQueries || 0}\n`;
  csv += `Failure Rate,${data.queryPerf?.failureRate || 0}%\n`;
  csv += `Timeout Queries,${data.queryPerf?.timeoutQueries || 0}\n\n`;

  // Slowest Queries
  csv += 'Slowest Queries\n';
  csv += 'Query,Execution Time (ms),Status,Executed At\n';
  (data.queryPerf?.slowestQueries || []).forEach((q: any) => {
    csv += `"${q.sqlQuery.replace(/"/g, '""')}",${q.executionTimeMs},${q.status},${q.executedAt}\n`;
  });
  csv += '\n';

  // Shared Datasets Section
  csv += '=== SHARED DATASETS ===\n';
  csv += `Total Shared Datasets,${data.sharedDatasets?.totalSharedDatasets || 0}\n`;
  csv += `Public Shares,${data.sharedDatasets?.publicShares || 0}\n`;
  csv += `Organization Shares,${data.sharedDatasets?.organizationShares || 0}\n`;
  csv += `Private Shares,${data.sharedDatasets?.privateShares || 0}\n`;
  csv += `Total API Calls,${data.sharedDatasets?.totalApiCalls || 0}\n`;
  csv += `API Calls Today,${data.sharedDatasets?.apiCallsToday || 0}\n\n`;

  // Most Accessed Datasets
  csv += 'Most Accessed Datasets\n';
  csv += 'Name,Type,Access Count,Last Accessed\n';
  (data.sharedDatasets?.mostAccessedDatasets || []).forEach((d: any) => {
    csv += `"${d.name}",${d.datasetType},${d.accessCount},${d.lastAccessedAt}\n`;
  });
  csv += '\n';

  // Data Freshness Section
  csv += '=== DATA FRESHNESS ===\n';
  csv += `Stale Datasets,${data.dataFreshness?.staleDatasets || 0}\n`;
  csv += `Failed Transformations,${data.dataFreshness?.failedTransformations || 0}\n`;
  csv += `Total Transformations,${data.dataFreshness?.totalTransformations || 0}\n`;
  csv += `Transformation Success Rate,${data.dataFreshness?.transformationSuccessRate || 0}%\n\n`;

  // Stale Datasets List
  if (data.dataFreshness?.staleDatasetsList?.length > 0) {
    csv += 'Stale Datasets\n';
    csv += 'Name,Type,Days Since Last Access\n';
    data.dataFreshness.staleDatasetsList.forEach((d: any) => {
      csv += `"${d.name}",${d.type},${d.daysSinceLastAccess}\n`;
    });
    csv += '\n';
  }

  // Failed Transformations
  if (data.dataFreshness?.failedTransformationsList?.length > 0) {
    csv += 'Failed Transformations\n';
    csv += 'Name,Consecutive Failures,Error Message\n';
    data.dataFreshness.failedTransformationsList.forEach((t: any) => {
      csv += `"${t.name}",${t.consecutiveFailures},"${t.errorMessage.replace(/"/g, '""')}"\n`;
    });
    csv += '\n';
  }

  // Connection Health Section
  csv += '=== CONNECTION HEALTH ===\n';
  csv += `Total Connections,${data.connectionHealth?.totalConnections || 0}\n`;
  csv += `Online Connections,${data.connectionHealth?.onlineConnections || 0}\n`;
  csv += `Offline Connections,${data.connectionHealth?.offlineConnections || 0}\n`;
  csv += `Error Connections,${data.connectionHealth?.errorConnections || 0}\n`;
  csv += `Idle Connections,${data.connectionHealth?.idleConnections || 0}\n\n`;

  // Connection Details
  csv += 'Connection Details\n';
  csv += 'Name,Type,Status,Query Count,Recent Errors,Last Used\n';
  (data.connectionHealth?.connections || []).forEach((c: any) => {
    csv += `"${c.name}",${c.type},${c.status},${c.queryCount},${c.recentErrors},${c.lastUsedAt}\n`;
  });

  // Download
  downloadFile(csv, filename, 'text/csv');
}

/**
 * Export Analytics Dashboard to PDF
 */
export function exportAnalyticsToPdf(data: {
  queryPerf: any;
  sharedDatasets: any;
  dataFreshness: any;
  connectionHealth: any;
}) {
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `datagate-analytics-${timestamp}.pdf`;

  const doc = new jsPDF();
  let yPos = 20;

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('DataGate Analytics Report', 14, yPos);
  yPos += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, yPos);
  yPos += 15;

  // Query Performance Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Query Performance', 14, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Average Execution Time: ${data.queryPerf?.avgExecutionTimeMs || 0} ms`, 14, yPos);
  yPos += 6;
  doc.text(`Total Queries: ${data.queryPerf?.totalQueries || 0}`, 14, yPos);
  yPos += 6;
  doc.text(`Failed Queries: ${data.queryPerf?.failedQueries || 0} (${data.queryPerf?.failureRate || 0}%)`, 14, yPos);
  yPos += 6;
  doc.text(`Timeout Queries: ${data.queryPerf?.timeoutQueries || 0}`, 14, yPos);
  yPos += 10;

  // Slowest Queries Table
  if (data.queryPerf?.slowestQueries?.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Top 10 Slowest Queries', 14, yPos);
    yPos += 5;

    autoTable(doc, {
      startY: yPos,
      head: [['Query', 'Time (ms)', 'Status']],
      body: data.queryPerf.slowestQueries.map((q: any) => [
        q.sqlQuery.substring(0, 60) + (q.sqlQuery.length > 60 ? '...' : ''),
        q.executionTimeMs,
        q.status,
      ]),
      theme: 'grid',
      headStyles: { fillColor: [26, 26, 26] },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 120 },
        1: { cellWidth: 30 },
        2: { cellWidth: 30 },
      },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // Add new page if needed
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  // Shared Datasets Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Shared Datasets', 14, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Shared: ${data.sharedDatasets?.totalSharedDatasets || 0}`, 14, yPos);
  yPos += 6;
  doc.text(`Public: ${data.sharedDatasets?.publicShares || 0} | Organization: ${data.sharedDatasets?.organizationShares || 0} | Private: ${data.sharedDatasets?.privateShares || 0}`, 14, yPos);
  yPos += 6;
  doc.text(`Total API Calls: ${data.sharedDatasets?.totalApiCalls || 0} (${data.sharedDatasets?.apiCallsToday || 0} today)`, 14, yPos);
  yPos += 10;

  // Most Accessed Datasets Table
  if (data.sharedDatasets?.mostAccessedDatasets?.length > 0) {
    autoTable(doc, {
      startY: yPos,
      head: [['Dataset', 'Type', 'Access Count']],
      body: data.sharedDatasets.mostAccessedDatasets.slice(0, 10).map((d: any) => [
        d.name,
        d.datasetType,
        d.accessCount,
      ]),
      theme: 'grid',
      headStyles: { fillColor: [26, 26, 26] },
      styles: { fontSize: 8 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // Add new page if needed
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  // Data Freshness Section
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Data Freshness & Quality', 14, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Stale Datasets: ${data.dataFreshness?.staleDatasets || 0}`, 14, yPos);
  yPos += 6;
  doc.text(`Failed Transformations: ${data.dataFreshness?.failedTransformations || 0}`, 14, yPos);
  yPos += 6;
  doc.text(`Transformation Success Rate: ${data.dataFreshness?.transformationSuccessRate || 0}%`, 14, yPos);
  yPos += 10;

  // Connection Health Section
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Connection Health', 14, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total: ${data.connectionHealth?.totalConnections || 0} | Online: ${data.connectionHealth?.onlineConnections || 0} | Offline: ${data.connectionHealth?.offlineConnections || 0} | Error: ${data.connectionHealth?.errorConnections || 0}`, 14, yPos);
  yPos += 10;

  // Connection Details Table
  if (data.connectionHealth?.connections?.length > 0) {
    autoTable(doc, {
      startY: yPos,
      head: [['Connection', 'Type', 'Status', 'Queries', 'Errors']],
      body: data.connectionHealth.connections.map((c: any) => [
        c.name,
        c.type.toUpperCase(),
        c.status,
        c.queryCount,
        c.recentErrors,
      ]),
      theme: 'grid',
      headStyles: { fillColor: [26, 26, 26] },
      styles: { fontSize: 8 },
    });
  }

  // Download
  doc.save(filename);
}

/**
 * Helper function to download a file
 */
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
