import 'package:flutter/material.dart';

import '../services/sync_service.dart';

/// A widget that displays the current sync status to the user.
/// Shows a pending/syncing/failed indicator when data is not fully synced.
///
/// Requirement 10.4: Show sync pending indicator to student.
class SyncStatusIndicator extends StatelessWidget {
  final SyncService syncService;

  const SyncStatusIndicator({
    super.key,
    required this.syncService,
  });

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<SyncStatus>(
      stream: syncService.statusStream,
      initialData: syncService.currentStatus,
      builder: (context, snapshot) {
        final status = snapshot.data ?? SyncStatus.synced;

        switch (status) {
          case SyncStatus.synced:
            return const SizedBox.shrink();
          case SyncStatus.pending:
            return _buildIndicator(
              context,
              icon: Icons.cloud_upload_outlined,
              label: 'Sync pending',
              color: Colors.orange,
            );
          case SyncStatus.syncing:
            return _buildIndicator(
              context,
              icon: Icons.sync,
              label: 'Syncing...',
              color: Colors.blue,
              spinning: true,
            );
          case SyncStatus.failed:
            return _buildIndicator(
              context,
              icon: Icons.cloud_off,
              label: 'Sync failed',
              color: Colors.red,
              showRetry: true,
            );
        }
      },
    );
  }

  Widget _buildIndicator(
    BuildContext context, {
    required IconData icon,
    required String label,
    required Color color,
    bool spinning = false,
    bool showRetry = false,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (spinning)
            SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation(color),
              ),
            )
          else
            Icon(icon, size: 14, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
          if (showRetry) ...[
            const SizedBox(width: 8),
            GestureDetector(
              onTap: () => syncService.manualSync(),
              child: Icon(
                Icons.refresh,
                size: 14,
                color: color,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
