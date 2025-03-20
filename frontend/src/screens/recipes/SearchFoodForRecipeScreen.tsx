import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import {
  Searchbar,
  Text,
  Card,
  Title,
  ActivityIndicator,
  Avatar,
  useTheme,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRoute } from '@react-navigation/core';
import type { RouteProp } from '@react-navigation/core';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import debounce from 'lodash/debounce';

import { foodService, FoodItem } from '../../services/foodService';
import { Food } from '../../types';
import { RecipeStackParamList } from '../../types/navigation';
import EmptyState from '../../components/common/EmptyState';

type SearchFoodForRecipeScreenNavigationProp = NativeStackNavigationProp<RecipeStackParamList>;
type SearchFoodForRecipeScreenRouteProp = RouteProp<RecipeStackParamList, 'SearchFoodForRecipe'>;

const getSourceIcon = (source: string) => {
  switch (source?.toLowerCase()) {
    case 'usda':
      return 'leaf';
    case 'openfoodfacts':
      return 'database';
    case 'custom':
      return 'food-apple';
    default:
      return 'food';
  }
};

const getSourceColor = (source: string, theme: any) => {
  switch (source?.toLowerCase()) {
    case 'usda':
      return '#4CAF50';
    case 'openfoodfacts':
      return '#2196F3';
    case 'custom':
      return '#FF9800';
    default:
      return theme.colors.primary;
  }
};

const mapFoodItemToFood = (item: FoodItem): Food => ({
  id: typeof item.id === 'string' ? parseInt(item.id, 10) : (item.id || Date.now()),
  name: item.name,
  barcode: item.barcode,
  brand: item.brand,
  calories: item.calories || 0,
  protein: item.protein || 0,
  carbs: item.carbs || 0,
  fat: item.fat || 0,
  serving_size: item.serving_size || 100,
  serving_unit: item.serving_unit || 'g',
  is_custom: item.source === 'custom',
  source: item.source === 'custom' ? 'custom' : 'usda',
  created_at: item.created_at || new Date().toISOString(),
  updated_at: item.updated_at || new Date().toISOString()
});

export function SearchFoodForRecipeScreen() {
  const theme = useTheme();
  const navigation = useNavigation<SearchFoodForRecipeScreenNavigationProp>();
  const route = useRoute<SearchFoodForRecipeScreenRouteProp>();

  console.log('SearchFoodForRecipeScreen mounted');
  console.log('Route params:', route.params);

  // Add a focus listener to detect when the screen becomes active
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      console.log('SearchFoodForRecipeScreen focused');
      console.log('Route params on focus:', route.params);
    });

    return unsubscribe;
  }, [navigation, route]);

  const { recipeId } = route.params as RecipeStackParamList['SearchFoodForRecipe'];
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [foods, setFoods] = useState<Food[]>([]);

  // Helper function to capitalize food name
  const capitalizeFoodName = (name: string): string => {
    return name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  };

  // Fetch foods function
  const fetchFoods = useCallback(async (query: string = '') => {
    try {
      setIsLoading(true);

      let results;
      if (query.trim()) {
        results = await foodService.searchFood(query);
      } else {
        // Get custom foods
        const customFoods = await foodService.getCustomFoods();

        // Sort custom foods alphabetically
        const sortedCustomFoods = customFoods.sort((a, b) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase())
        );

        results = {
          foods: sortedCustomFoods,
          total: sortedCustomFoods.length,
          page: 1,
          limit: 20
        };
      }

      // Map foods using the helper function and ensure all fields have defaults
      const mappedFoods = (results.foods || []).map(food => ({
        ...mapFoodItemToFood(food),
        name: capitalizeFoodName(food.name),
        calories: food.calories || 0,
        protein: food.protein || 0,
        carbs: food.carbs || 0,
        fat: food.fat || 0,
        serving_size: food.serving_size || 100,
        serving_unit: food.serving_unit || 'g',
        is_custom: food.source === 'custom',
        source: food.source === 'custom' ? 'custom' : 'usda'
      }));

      setFoods(mappedFoods);
    } catch (error) {
      console.error('Error fetching foods:', error);
      Alert.alert(
        'Error',
        'Failed to load foods. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchFoods();
  }, [fetchFoods]);

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

  // Handle selecting a food item
  const handleSelectFood = async (food: Food) => {
    try {
      // If the food is not custom, create a custom copy
      if (!food.is_custom) {
        const customFood = await foodService.createCustomFood({
          name: food.name,
          brand: food.brand,
          calories: food.calories || 0,
          protein: food.protein || 0,
          carbs: food.carbs || 0,
          fat: food.fat || 0,
          serving_size: food.serving_size || 100,
          serving_unit: food.serving_unit || 'g',
          source: 'custom'
        });

        // Ensure all fields are properly set
        food = {
          ...customFood,
          name: capitalizeFoodName(customFood.name),
          calories: customFood.calories || food.calories || 0,
          protein: customFood.protein || food.protein || 0,
          carbs: customFood.carbs || food.carbs || 0,
          fat: customFood.fat || food.fat || 0,
          serving_size: customFood.serving_size || food.serving_size || 100,
          serving_unit: customFood.serving_unit || food.serving_unit || 'g',
          is_custom: true,
          source: 'custom',
          created_at: customFood.created_at || new Date().toISOString(),
          updated_at: customFood.updated_at || new Date().toISOString()
        };
      }

      // Navigate back to recipe detail with the selected food and original recipeId
      navigation.navigate('RecipeDetail', {
        recipeId: typeof recipeId === 'string' ? 'new' : Number(recipeId),
        selectedIngredient: food
      });
    } catch (error) {
      console.error('Error handling food selection:', error);
      Alert.alert(
        'Error',
        'Failed to add food to recipe. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const renderFoodItem = ({ item }: { item: Food }) => (
    <TouchableOpacity onPress={() => handleSelectFood(item)}>
      <Card style={styles.foodCard}>
        <Card.Content style={styles.foodCardContent}>
          <Avatar.Icon
            size={40}
            icon={getSourceIcon(item.source || '')}
            style={{ backgroundColor: getSourceColor(item.source || '', theme) }}
            color="#fff"
          />
          <View style={styles.foodInfo}>
            <Title style={styles.foodName}>{item.name}</Title>
            {item.brand && <Text style={styles.brandText}>{item.brand}</Text>}
            <Text style={styles.servingText}>
              Per {item.serving_size || 1} {item.serving_unit || 'serving'}
            </Text>
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
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

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
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading foods...</Text>
        </View>
      ) : foods.length > 0 ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollViewContent}
        >
          {foods.map((food) => renderFoodItem({ item: food }))}
        </ScrollView>
      ) : (
        <EmptyState
          icon="food-apple"
          title="No foods found"
          message={searchQuery ? "Try a different search term" : "Search for foods to add to your recipe"}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#fff',
    elevation: 2,
  },
  searchBar: {
    elevation: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    padding: 16,
  },
  foodCard: {
    marginBottom: 16,
    elevation: 2,
  },
  foodCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  foodInfo: {
    flex: 1,
    marginLeft: 16,
  },
  foodName: {
    fontSize: 16,
    marginBottom: 4,
  },
  brandText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  servingText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  macroContainer: {
    flexDirection: 'row',
    marginTop: 8,
  },
  macroItem: {
    marginRight: 16,
  },
  macroValue: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  macroLabel: {
    fontSize: 12,
    color: '#666',
  },
  actionButton: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#666',
  },
});