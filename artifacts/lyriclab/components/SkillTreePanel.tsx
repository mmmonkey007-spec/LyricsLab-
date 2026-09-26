import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";
import {
  ASSASSIN_SKILL_TREE,
  SKILL_TREE_TABS,
  type SkillDefinition,
  type SkillTreeClass,
} from "@/services/skillTree";

interface SkillTreePanelProps {
  currentLevel: number;
  currentClass: SkillTreeClass;
}

export function SkillTreePanel({ currentLevel, currentClass }: SkillTreePanelProps) {
  const colors = useColors();
  const [activeClass, setActiveClass] = useState<SkillTreeClass>(currentClass);
  const [selectedSkill, setSelectedSkill] = useState<SkillDefinition | null>(null);

  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.panelHeader}>
        <View style={styles.titleBlock}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>CHARACTER BUILD</Text>
          <Text style={[styles.panelTitle, { color: colors.text }]}>Skill Tree</Text>
        </View>
        <View style={[styles.levelBadge, { borderColor: colors.accent + "70", backgroundColor: colors.accent + "14" }]}>
          <Text style={[styles.levelLabel, { color: colors.textMuted }]}>CURRENT LEVEL</Text>
          <Text style={[styles.levelNumber, { color: colors.accent }]}>{currentLevel}</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
      >
        {SKILL_TREE_TABS.map((tab) => {
          const selected = activeClass === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => setActiveClass(tab.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[
                styles.tab,
                {
                  backgroundColor: selected ? colors.accent + "1E" : colors.surface,
                  borderColor: selected ? colors.accent : colors.border,
                },
              ]}
            >
              <Text style={[styles.tabText, { color: selected ? colors.accent : colors.textMuted }]}>
                {tab.label}
              </Text>
              {tab.comingSoon ? (
                <Text style={[styles.tabMeta, { color: colors.textMuted }]}>COMING SOON</Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {activeClass !== "assassin" ? (
        <View style={[styles.comingSoonCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Feather name="lock" size={18} color={colors.textMuted} />
          <Text style={[styles.comingSoonTitle, { color: colors.text }]}>
            {activeClass === "rider" ? "Flow Rider" : "Trickster"} tree coming soon
          </Text>
          <Text style={[styles.comingSoonBody, { color: colors.textMuted }]}>
            This class's skill paths are still being designed.
          </Text>
        </View>
      ) : (
        <View style={styles.tree}>
          {ASSASSIN_SKILL_TREE.map((pair, index) => (
            <View key={pair.level} style={styles.levelGroup}>
              {index > 0 ? (
                <View style={[styles.trunk, { backgroundColor: colors.accent + "80" }]} />
              ) : null}
              <View style={styles.levelHeading}>
                <View style={[styles.levelDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.unlockHeading, { color: colors.text }]}>LEVEL {pair.level}</Text>
                <View style={[styles.headingLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.categoryLabel, { color: colors.violet }]}>
                  {pair.level === 5 ? "ACTIVE" : "PASSIVE"}
                </Text>
              </View>

              <View style={styles.branch}>
                <View style={[styles.branchLine, { backgroundColor: colors.accent + "65" }]} />
                <View style={[styles.choosePill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.chooseText, { color: colors.textMuted }]}>CHOOSE ONE</Text>
                </View>
              </View>

              <View style={styles.skillsRow}>
                {pair.skills.map((skill) => {
                  const locked = skill.alwaysLocked === true || currentLevel < skill.unlockLevel;
                  return (
                    <Pressable
                      key={skill.id}
                      onPress={() => setSelectedSkill(skill)}
                      accessibilityRole="button"
                      accessibilityLabel={`${skill.name}, ${locked ? `unlocks at level ${skill.unlockLevel}` : "available to choose"}`}
                      style={styles.skillButton}
                    >
                      <View
                        style={[
                          styles.iconTile,
                          {
                            backgroundColor: colors.surface,
                            borderColor: locked ? colors.border : colors.accent + "B0",
                            opacity: locked ? 0.42 : 1,
                          },
                        ]}
                      >
                        <Feather
                          name={skill.icon}
                          size={24}
                          color={locked ? colors.textMuted : colors.accent}
                        />
                        {locked ? (
                          <View style={[styles.lockBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            <Feather name="lock" size={10} color={colors.textMuted} />
                          </View>
                        ) : null}
                      </View>
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.skillName,
                          { color: colors.text, opacity: locked ? 0.52 : 1 },
                        ]}
                      >
                        {skill.name}
                      </Text>
                      <Text
                        style={[
                          styles.availability,
                          { color: locked ? colors.textMuted : colors.cyan },
                        ]}
                      >
                        {locked ? `Unlocks at level ${skill.unlockLevel}` : "Available to choose"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      )}

      <Text style={[styles.provisional, { color: colors.textMuted }]}>Values are provisional</Text>

      <Modal
        transparent
        visible={selectedSkill !== null}
        animationType="fade"
        onRequestClose={() => setSelectedSkill(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedSkill(null)}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={[styles.detailCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            {selectedSkill ? (
              <>
                <View style={styles.detailHeader}>
                  <View style={[styles.detailIcon, { backgroundColor: colors.accent + "18" }]}>
                    <Feather name={selectedSkill.icon} size={24} color={colors.accent} />
                  </View>
                  <View style={styles.detailTitleWrap}>
                    <Text style={[styles.detailName, { color: colors.text }]}>{selectedSkill.name}</Text>
                    <Text style={[styles.detailType, { color: colors.violet }]}>
                      {selectedSkill.type.toUpperCase()} · LEVEL {selectedSkill.unlockLevel}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setSelectedSkill(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Close skill details"
                    style={styles.closeButton}
                  >
                    <Feather name="x" size={20} color={colors.textMuted} />
                  </Pressable>
                </View>
                <Text style={[styles.effectLabel, { color: colors.textMuted }]}>EFFECT</Text>
                <Text style={[styles.effectText, { color: colors.text }]}>{selectedSkill.effect}</Text>
                <Text style={[styles.detailAvailability, { color: colors.accent }]}>
                  {selectedSkill.alwaysLocked || currentLevel < selectedSkill.unlockLevel
                    ? `Unlocks at level ${selectedSkill.unlockLevel}`
                    : "Available to choose"}
                </Text>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 14 },
  panelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  titleBlock: { gap: 2 },
  eyebrow: { fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  panelTitle: { fontSize: 22, lineHeight: 28, fontWeight: "800" },
  levelBadge: { minWidth: 82, borderRadius: 10, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6, alignItems: "center" },
  levelLabel: { fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  levelNumber: { fontSize: 20, lineHeight: 24, fontWeight: "900" },
  tabs: { gap: 7, paddingRight: 2 },
  tab: { minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, justifyContent: "center" },
  tabText: { fontSize: 11, fontWeight: "800" },
  tabMeta: { fontSize: 7, fontWeight: "800", letterSpacing: 0.6, marginTop: 2 },
  tree: { paddingTop: 2 },
  levelGroup: { paddingBottom: 10 },
  trunk: { width: 2, height: 12, alignSelf: "center", marginBottom: 8 },
  levelHeading: { flexDirection: "row", alignItems: "center", gap: 7 },
  levelDot: { width: 8, height: 8, borderRadius: 4 },
  unlockHeading: { fontSize: 11, fontWeight: "900", letterSpacing: 0.9 },
  headingLine: { flex: 1, height: 1 },
  categoryLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.7 },
  branch: { height: 22, justifyContent: "center", alignItems: "center" },
  branchLine: { height: 1, width: "78%" },
  choosePill: { position: "absolute", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  chooseText: { fontSize: 7, fontWeight: "900", letterSpacing: 0.5 },
  skillsRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  skillButton: { width: "47%", alignItems: "center", minHeight: 110, paddingHorizontal: 2 },
  iconTile: { width: 58, height: 58, borderWidth: 1, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  lockBadge: { position: "absolute", top: -5, right: -5, width: 19, height: 19, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  skillName: { minHeight: 30, marginTop: 5, fontSize: 12, fontWeight: "800", textAlign: "center" },
  availability: { fontSize: 8, fontWeight: "700", textAlign: "center", lineHeight: 11 },
  comingSoonCard: { borderWidth: 1, borderRadius: 12, alignItems: "center", paddingVertical: 24, paddingHorizontal: 16, gap: 8 },
  comingSoonTitle: { fontSize: 14, fontWeight: "800", textAlign: "center" },
  comingSoonBody: { fontSize: 12, lineHeight: 18, textAlign: "center" },
  provisional: { fontSize: 10, textAlign: "center", fontStyle: "italic" },
  modalBackdrop: { flex: 1, backgroundColor: "#000000B8", justifyContent: "flex-end", padding: 16, paddingBottom: 30 },
  detailCard: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 12 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  detailIcon: { width: 46, height: 46, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  detailTitleWrap: { flex: 1, gap: 4 },
  detailName: { fontSize: 18, fontWeight: "800" },
  detailType: { fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  closeButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  effectLabel: { fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  effectText: { fontSize: 14, lineHeight: 21 },
  detailAvailability: { fontSize: 11, fontWeight: "800" },
});