import React from 'react';
import { View, StyleSheet, Text, Pressable, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface NotesEditorModalProps {
  visible: boolean;
  isDark: boolean;
  notes: string;
  onClose: () => void;
  onNotesChange: (notes: string) => void;
  onSave: (notes: string) => void;
}

export const NotesEditorModal: React.FC<NotesEditorModalProps> = ({
  visible,
  isDark,
  notes,
  onClose,
  onNotesChange,
  onSave,
}) => {
  const handleSave = () => {
    onSave(notes);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable
          style={[
            styles.modalContent,
            {
              backgroundColor: isDark ? '#0f172a' : '#ffffff',
              borderColor: isDark ? '#334155' : '#e2e8f0',
              borderWidth: 1,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View
            style={[
              styles.modalHeader,
              {
                borderBottomColor: isDark ? '#334155' : '#e2e8f0',
              },
            ]}
          >
            <Text
              style={[
                styles.modalTitle,
                {
                  color: isDark ? '#ffffff' : '#0f172a',
                },
              ]}
            >
              Notes
            </Text>
            <Pressable onPress={onClose}>
              <Ionicons
                name="close"
                size={18}
                color={isDark ? '#94a3b8' : '#64748b'}
              />
            </Pressable>
          </View>
          <View style={styles.notesContainer}>
            <TextInput
              style={[
                styles.notesInput,
                {
                  backgroundColor: isDark ? '#1e293b' : '#f8fafc',
                  color: isDark ? '#ffffff' : '#0f172a',
                  borderColor: isDark ? '#334155' : '#e2e8f0',
                },
              ]}
              value={notes}
              onChangeText={onNotesChange}
              placeholder="Add driver notes..."
              placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
            <View style={styles.modalFooterButtons}>
              <Pressable
                style={[
                  styles.cancelButton,
                  {
                    backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
                    borderColor: isDark ? '#334155' : '#e2e8f0',
                  },
                ]}
                onPress={onClose}
              >
                <Text style={[styles.cancelButtonText, { color: isDark ? '#ffffff' : '#334155' }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                style={[
                  styles.saveButton,
                  {
                    backgroundColor: '#4f46e5',
                  },
                ]}
                onPress={handleSave}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '90%',
    maxWidth: 384,
    borderRadius: 16,
    maxHeight: '80%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  notesContainer: {
    padding: 16,
  },
  notesInput: {
    width: '100%',
    height: 160,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 14,
  },
  modalFooterButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});

