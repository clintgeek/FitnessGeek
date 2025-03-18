import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Alert, ScrollView, RefreshControl } from 'react-native';
import {
  Searchbar,
  FAB,
  Text,
  Card,
  Title,
  Paragraph,
  Divider,
  Avatar,
  Chip,
  useTheme,
  Button,
  Portal,
  Dialog,
} from 'react-native-paper';
import { useNavigation, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useRoute } from '@react-navigation/core';
import { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import axios from 'axios';
import debounce from 'lodash/debounce';

import { foodService, FoodItem } from '../../services/foodService';
import { Food, CreateFoodDTO } from '../../types/Food';
import EmptyState from '../../components/common/EmptyState';
import EditableTextInput from '../../components/common/EditableTextInput';
import { formatBarcodeForDisplay } from '../../utils/validation';
import { FoodStackParamList } from '../../navigation/FoodStackNavigator';
import { getSourceIcon, getSourceColor } from '../../utils/foodUtils';
import { LoadingSpinner, SkeletonCard, LoadingOverlay } from '../../components/common';

type RouteParams = {
  scannedFood?: Food;
  refresh?: boolean;
  fromLog?: boolean;
  mealType?: string;
  date?: string;
};

const mapFoodItemToFood = (item: FoodItem): Food => ({
  id: item.id.toString(),
  name: item.name,
  barcode: item.barcode,
  brand: item.brand,
  calories: item.calories,
  protein: item.protein,
  carbs: item.carbs,
  fat: item.fat,
  serving_size: item.serving_size,
  serving_unit: item.serving_unit,
  is_custom: item.source === 'custom',
  source: item.source as 'custom' | 'usda' | 'recipe',
  created_at: item.created_at || new Date().toISOString(),
  updated_at: item.updated_at || new Date().toISOString()
});

const FoodScreen: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();
  const { fromLog } = (route.params as RouteParams) || {};
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [foods, setFoods] = useState<Food[]>([]);
  const [filteredFoods, setFilteredFoods] = useState<Food[]>([]);
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [isFoodDetailsVisible, setIsFoodDetailsVisible] = useState(false);
  const [foodToDelete, setFoodToDelete] = useState<Food | null>(null);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState({});

  // Fetch foods function
  const fetchFoods = useCallback(async (query: string = '', forceRefresh: boolean = false) => {
    try {
      setIsLoading(!forceRefresh);
      if (forceRefresh) setIsRefreshing(true);

      let results;
      if (query.trim()) {
        results = await foodService.searchFood(query);
      } else {
        const customFoods = await foodService.getCustomFoods();
        const sortedFoods = customFoods
          .map(item => mapFoodItemToFood(item))
          .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

        results = {
          foods: sortedFoods,
          total: customFoods.length,
          page: 1,
          limit: 20
        };
      }

      const sortedResults = query.trim() ? results.foods : results.foods.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
      setFoods(sortedResults || []);
      setFilteredFoods(sortedResults || []);
    } catch (error) {
      console.error('Error fetching foods:', error);
      Alert.alert('Error', 'Failed to fetch foods. Please try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Handle scanned food and refresh params
  useEffect(() => {
    const params = route.params as { scannedFood?: Food; refresh?: boolean } | undefined;

    if (params?.scannedFood) {
      setSelectedFood(params.scannedFood);
      setIsFoodDetailsVisible(true);
      navigation.setParams({ scannedFood: undefined });
    }
    if (params?.refresh) {
      fetchFoods(searchQuery, true);
      navigation.setParams({ refresh: undefined });
    }
  }, [route.params, navigation, fetchFoods, searchQuery]);

  // Initial load
  useEffect(() => {
    fetchFoods();
  }, [fetchFoods]);

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      fetchFoods(searchQuery, true);
      return () => {
        setFabOpen(false);
      };
    }, [fetchFoods, searchQuery])
  );

  // Create a memoized debounced search function
  const debouncedSearch = useMemo(
    () => debounce((query: string) => {
      fetchFoods(query);
    }, 1000),
    [fetchFoods]
  );

  // Handle search query change
  const handleSearchQueryChange = (query: string) => {
    setSearchQuery(query);
    debouncedSearch(query);
  };

  // Handle refresh
  const handleRefresh = useCallback(() => {
    fetchFoods(searchQuery, true);
  }, [fetchFoods, searchQuery]);

  // Handle adding food to log
  const handleAddToLog = (food: Food) => {
    const { mealType, date } = route.params as { mealType?: string; date?: string };
    navigation.navigate('LogStack', {
      screen: 'AddFoodToLogModal',
      params: {
        food,
        mealType: mealType || 'snack',
        date: date || new Date().toISOString().split('T')[0]
      }
    });
  };

  const handleSaveFood = async () => {
    if (!selectedFood) return;

    try {
      const foodData: CreateFoodDTO = {
        name: selectedFood.name.trim().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' '),
        calories: Math.round(selectedFood.calories || 0),
        protein: Math.round(selectedFood.protein || 0),
        carbs: Math.round(selectedFood.carbs || 0),
        fat: Math.round(selectedFood.fat || 0),
        serving_size: Math.round(Number(selectedFood.serving_size) || 100),
        serving_unit: selectedFood.serving_unit || '',
        barcode: selectedFood.barcode,
        brand: selectedFood.brand,
        source: 'custom',
        source_id: selectedFood.source_id,
      };

      let savedFoodId: number;

      if (selectedFood.id && selectedFood.source === 'custom') {
        // Update existing custom food
        const id = parseInt(selectedFood.id.toString());
        if (isNaN(id)) {
          throw new Error('Invalid food ID');
        }
        await foodService.updateCustomFood(id, foodData);
        savedFoodId = id;
      } else {
        // Create new custom food
        const result = await foodService.createCustomFood(foodData);
        if (!result || typeof result.id !== 'number') {
          throw new Error('Invalid response from createCustomFood');
        }
        savedFoodId = result.id;
      }

      // Just saving the food, stay on food screen
      setIsFoodDetailsVisible(false);
      setSelectedFood(null);
      fetchFoods(searchQuery, true);
      Alert.alert('Success', 'Food saved successfully!');
    } catch (error) {
      console.error('Error saving food:', error);
      alert('Failed to save food. Please try again.');
    }
  };

  const navigateToFoodDetails = (food: Food) => {
    setSelectedFood(food);
    setIsFoodDetailsVisible(true);
  };

  const navigateToAddFood = () => {
    navigation.navigate('AddFood');
  };

  const navigateToScanBarcode = () => {
    navigation.navigate('BarcodeScanner');
  };

  const handleDeleteFood = async (food: Food) => {
    setFoodToDelete(food);
    setIsDeleteModalVisible(true);
  };

  const confirmDelete = async () => {
    if (!foodToDelete) return;

    try {
      await foodService.deleteFood(parseInt(foodToDelete.id.toString(), 10));
      await fetchFoods(searchQuery, true);
      setIsDeleteModalVisible(false);
      setFoodToDelete(null);
    } catch (error) {
      console.error('Error deleting food:', error);
      alert('Failed to delete food. Please try again.');
    }
  };

  const renderNutritionInfo = (food: Food) => (
    <View style={styles.nutritionInfo}>
      <Text>Calories: {food.calories}</Text>
      <Text>Protein: {food.protein}g</Text>
      <Text>Carbs: {food.carbs}g</Text>
      <Text>Fat: {food.fat}g</Text>
      <Text>Serving: {food.serving_size} {food.serving_unit}</Text>
    </View>
  );

  const renderFoodDetails = () => {
    if (!selectedFood) return null;

    return (
      <View style={styles.detailsContainer}>
        <EditableTextInput
          label="Name"
          value={selectedFood.name}
          onChangeText={(text) => setSelectedFood(prev => prev ? { ...prev, name: text } : null)}
          style={styles.input}
        />
        <EditableTextInput
          label="Brand"
          value={selectedFood.brand || ''}
          onChangeText={(text) => setSelectedFood(prev => prev ? { ...prev, brand: text } : null)}
          style={styles.input}
        />
        <View style={styles.servingContainer}>
          <EditableTextInput
            label="Serving Size"
            value={selectedFood.serving_size?.toString() || '100'}
            onChangeText={(text) => setSelectedFood(prev => prev ? { ...prev, serving_size: parseFloat(text) || 100 } : null)}
            keyboardType="numeric"
            style={[styles.input, styles.servingSizeInput]}
          />
          <EditableTextInput
            label="Unit"
            value={selectedFood.serving_unit || ''}
            onChangeText={(text) => setSelectedFood(prev => prev ? { ...prev, serving_unit: text } : null)}
            style={[styles.input, styles.servingUnitInput]}
          />
        </View>
        <EditableTextInput
          label="Calories (per serving)"
          value={selectedFood.calories?.toString() || '0'}
          onChangeText={(text) => setSelectedFood(prev => prev ? { ...prev, calories: parseFloat(text) || 0 } : null)}
          keyboardType="numeric"
          style={styles.input}
        />
        <EditableTextInput
          label="Protein (g per serving)"
          value={selectedFood.protein?.toString() || '0'}
          onChangeText={(text) => setSelectedFood(prev => prev ? { ...prev, protein: parseFloat(text) || 0 } : null)}
          keyboardType="numeric"
          style={styles.input}
        />
        <EditableTextInput
          label="Carbs (g per serving)"
          value={selectedFood.carbs?.toString() || '0'}
          onChangeText={(text) => setSelectedFood(prev => prev ? { ...prev, carbs: parseFloat(text) || 0 } : null)}
          keyboardType="numeric"
          style={styles.input}
        />
        <EditableTextInput
          label="Fat (g per serving)"
          value={selectedFood.fat?.toString() || '0'}
          onChangeText={(text) => setSelectedFood(prev => prev ? { ...prev, fat: parseFloat(text) || 0 } : null)}
          keyboardType="numeric"
          style={styles.input}
        />
      </View>
    );
  };

  const renderFoodItem = ({ item }: { item: Food }) => {
    const sourceColor = getSourceColor(item.source || '', theme);

    return (
      <TouchableOpacity onPress={() => navigateToFoodDetails(item)}>
        <Card style={styles.foodCard}>
          <Card.Content style={styles.foodCardContent}>
            <Avatar.Icon
              size={40}
              icon={getSourceIcon(item.source || '')}
              style={{ backgroundColor: sourceColor }}
              color="#fff"
            />
            <View style={styles.foodInfo}>
              <Title style={[styles.foodName, { color: sourceColor }]}>{item.name}</Title>
              {item.brand && <Text style={styles.brandText}>{item.brand}</Text>}

              <View style={styles.macroContainer}>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{item.calories}</Text>
                  <Text style={styles.macroLabel}>Calories</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{item.protein}g</Text>
                  <Text style={styles.macroLabel}>Protein</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{item.carbs}g</Text>
                  <Text style={styles.macroLabel}>Carbs</Text>
                </View>
                <View style={styles.macroItem}>
                  <Text style={styles.macroValue}>{item.fat}g</Text>
                  <Text style={styles.macroLabel}>Fat</Text>
                </View>
              </View>
            </View>

            {/* Only show add button when coming from log screen */}
            {fromLog && (
              <TouchableOpacity
                onPress={() => handleAddToLog(item)}
                style={styles.actionButton}
              >
                <MaterialCommunityIcons name="plus-circle" size={24} color={theme.colors.primary} />
              </TouchableOpacity>
            )}
          </Card.Content>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search foods..."
          onChangeText={handleSearchQueryChange}
          value={searchQuery}
          style={styles.searchBar}
          icon="magnify"
          clearIcon="close"
        />

        <TouchableOpacity
          style={styles.scanButton}
          onPress={navigateToScanBarcode}
        >
          <Ionicons name="barcode-outline" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <SkeletonCard style={{ width: '100%' }} />
          <SkeletonCard style={{ width: '100%' }} />
          <SkeletonCard style={{ width: '100%' }} />
          <SkeletonCard style={{ width: '100%' }} />
        </View>
      ) : (
        <FlatList
          data={filteredFoods}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderFoodItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchFoods('', true)}
              colors={[theme.colors.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="food-apple"
              title="No Foods Found"
              message={searchQuery ? "Try a different search term" : "Add your first food item"}
              actionLabel="Add Food"
              onAction={() => navigateToAddFood()}
            />
          }
        />
      )}

      <Portal>
        <Dialog
          visible={isFoodDetailsVisible}
          onDismiss={() => {
            setIsFoodDetailsVisible(false);
            setSelectedFood(null);
          }}
          style={styles.detailsDialog}
        >
          <Dialog.Title>Food Details</Dialog.Title>
          <Dialog.Content>
            <View style={styles.dialogContent}>
              {renderFoodDetails()}
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => {
              setIsFoodDetailsVisible(false);
              setSelectedFood(null);
            }}>Cancel</Button>
            {selectedFood?.source === 'custom' && (
              <Button
                onPress={() => {
                  setFoodToDelete(selectedFood);
                  setIsDeleteModalVisible(true);
                  setIsFoodDetailsVisible(false);
                }}
                textColor={theme.colors.error}
              >
                Delete
              </Button>
            )}
            <Button onPress={handleSaveFood} mode="contained">
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog
          visible={isDeleteModalVisible}
          onDismiss={() => setIsDeleteModalVisible(false)}
        >
          <Dialog.Title>Delete Food</Dialog.Title>
          <Dialog.Content>
            <Text>Are you sure you want to delete "{foodToDelete?.name}"?</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setIsDeleteModalVisible(false)}>Cancel</Button>
            <Button onPress={confirmDelete} mode="contained" textColor={theme.colors.error}>
              Delete
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Only render FAB.Group when screen is focused */}
        {isFocused && (
          <FAB.Group
            open={fabOpen}
            visible={true}
            icon={fabOpen ? 'close' : 'plus'}
            actions={[
              {
                icon: 'food-apple',
                label: 'Add Food',
                onPress: () => {
                  setFabOpen(false);
                  navigation.navigate('AddFood');
                },
              },
              {
                icon: 'barcode',
                label: 'Scan Barcode',
                onPress: () => {
                  setFabOpen(false);
                  navigation.navigate('BarcodeScanner');
                },
              },
            ]}
            onStateChange={({ open }) => setFabOpen(open)}
            style={styles.fab}
          />
        )}
      </Portal>

      {/* Add loading overlay for delete operation */}
      <LoadingOverlay visible={Object.values(isDeleting).some(Boolean)} message="Deleting food..." />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    zIndex: 1,
  },
  searchBar: {
    flex: 1,
    marginRight: 8,
    elevation: 0,
  },
  scanButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    elevation: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    padding: 16,
    paddingBottom: 80, // Add padding for FAB
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
  },
  foodCard: {
    marginBottom: 16,
    elevation: 2,
    borderRadius: 8,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  foodCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  foodInfo: {
    flex: 1,
    marginLeft: 16,
  },
  foodName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  brandText: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 4,
  },
  nutritionInfo: {
    marginTop: 4,
  },
  calories: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  macros: {
    fontSize: 14,
    color: '#757575',
  },
  rightActions: {
    marginLeft: 16,
  },
  deleteButton: {
    padding: 8,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
  detailsDialog: {
    maxWidth: 400,
    width: '90%',
    alignSelf: 'center',
  },
  dialogContent: {
    marginBottom: 16,
  },
  detailsContainer: {
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
  },
  servingContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  servingSizeInput: {
    flex: 2,
    marginRight: 8,
  },
  servingUnitInput: {
    flex: 1,
  },
  macroContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  macroItem: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  macroValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  macroLabel: {
    fontSize: 14,
    color: '#757575',
  },
  actionButton: {
    margin: 0,
    padding: 0,
  },
  listContent: {
    padding: 16,
    paddingBottom: 80, // Add padding for FAB
  },
});

export default FoodScreen;