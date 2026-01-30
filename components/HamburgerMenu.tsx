import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
} from 'react-native';
import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface MenuItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
}

const MENU_ITEMS: MenuItem[] = [
  { label: 'PCR Generator', icon: 'document-text', route: '/' },
  { label: 'Medical Chat', icon: 'chatbubbles', route: '/chat' },
  { label: 'Settings', icon: 'settings-outline', route: '/settings' },
];

export function HamburgerMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const handleNavigation = (route: string) => {
    setIsOpen(false);
    if (pathname !== route) {
      router.push(route);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={styles.menuButton}
        onPress={() => setIsOpen(true)}
      >
        <Ionicons name="menu" size={24} color="#94a3b8" />
      </TouchableOpacity>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <Pressable 
          style={styles.overlay} 
          onPress={() => setIsOpen(false)}
        >
          <View style={[styles.menuContainer, { paddingTop: insets.top + 16 }]}>
            <Text style={styles.menuTitle}>Navigation</Text>
            
            {MENU_ITEMS.map((item) => {
              const isActive = pathname === item.route;
              return (
                <TouchableOpacity
                  key={item.route}
                  style={[styles.menuItem, isActive && styles.menuItemActive]}
                  onPress={() => handleNavigation(item.route)}
                >
                  <Ionicons 
                    name={item.icon} 
                    size={22} 
                    color={isActive ? '#6366f1' : '#94a3b8'} 
                  />
                  <Text style={[styles.menuLabel, isActive && styles.menuLabelActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  menuButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#334155',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  menuContainer: {
    backgroundColor: '#1e293b',
    width: '70%',
    height: '100%',
    paddingHorizontal: 16,
    borderRightWidth: 1,
    borderRightColor: '#334155',
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  menuItemActive: {
    backgroundColor: '#334155',
  },
  menuLabel: {
    fontSize: 16,
    color: '#e2e8f0',
  },
  menuLabelActive: {
    color: '#6366f1',
    fontWeight: '600',
  },
});
