# SPDX-License-Identifier: AGPL-3.0-or-later
#
# R8 keep rules for the Mutuvia Android shell (release builds only).
#
# Nothing extra is needed today:
# - Activities, receivers and providers referenced from AndroidManifest.xml
#   (MutuviaLauncherActivity, the androidbrowserhelper activities and
#   FileProvider) are kept by the rules AAPT generates.
# - androidbrowserhelper only uses reflection on manifest-declared activities.
#
# Keep source file names and line numbers so crash reports stay readable.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
