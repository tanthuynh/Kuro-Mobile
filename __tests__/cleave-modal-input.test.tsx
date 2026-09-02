/**
 * __tests__/cleave-modal-input.test.tsx
 * Unit test suite for Reusable Mobile-First CleaveModalInput Component.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { CleaveModalInput } from '@/components/repair/cleave-modal-input';

// Mock Theme
jest.mock('@/context/theme-context', () => {
  const actualTheme = jest.requireActual('@/constants/theme');
  return {
    useTheme: () => ({
      colors: actualTheme.darkColors,
      typography: actualTheme.typography,
      spacing: actualTheme.spacing,
      layout: actualTheme.layout,
      isDark: true,
    }),
    ThemeProvider: ({ children }: any) => children,
  };
});

describe('CleaveModalInput Component', () => {
  const mockSuggestions = [
    { id: '1', name: 'Robe MegaPointe (Lighting)', category: 'Lighting' },
    { id: '2', name: 'Clay Paky Sharpy [V2]', category: 'Lighting' },
    { id: '3', name: 'GrandMA3 Full-Size *Pro*', category: 'Control' },
  ];

  it('renders touch row with label, value, and edit icon', () => {
    const handleChangeText = jest.fn();
    const { getByText, getByTestId } = render(
      <CleaveModalInput
        label="EQUIPMENT"
        value="Robe MegaPointe"
        onChangeText={handleChangeText}
        testID="cleave-test-input"
      />
    );

    expect(getByText('EQUIPMENT')).toBeTruthy();
    expect(getByTestId('cleave-test-input')).toBeTruthy();
  });

  it('opens modal dialog when pressing touch row', () => {
    const handleChangeText = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <CleaveModalInput
        label="OWNER"
        value=""
        placeholder="Select owner..."
        onChangeText={handleChangeText}
        testID="cleave-owner"
      />
    );

    expect(queryByTestId('cleave-owner-modal')).toBeNull();

    act(() => {
      fireEvent.press(getByTestId('cleave-owner'));
    });

    expect(getByTestId('cleave-owner-modal')).toBeTruthy();
  });

  it('does not open modal dialog when editable is false', () => {
    const handleChangeText = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <CleaveModalInput
        label="SERIAL"
        value="SN-123"
        editable={false}
        onChangeText={handleChangeText}
        testID="cleave-serial"
      />
    );

    act(() => {
      fireEvent.press(getByTestId('cleave-serial'));
    });

    expect(queryByTestId('cleave-serial-modal')).toBeNull();
  });

  it('filters suggestions and highlights matches with special regex characters safely', () => {
    const handleChangeText = jest.fn();
    const { getByTestId, getByText, queryByText } = render(
      <CleaveModalInput
        label="EQUIPMENT"
        value=""
        suggestions={mockSuggestions}
        getSuggestionLabel={(item) => item.name}
        getSuggestionBadge={(item) => item.category}
        getSuggestionKey={(item) => item.id}
        onChangeText={handleChangeText}
        testID="cleave-eq"
      />
    );

    act(() => {
      fireEvent.press(getByTestId('cleave-eq'));
    });

    const searchInput = getByTestId('cleave-eq-search-input');
    
    // Type query with regex special chars `[` and `(`
    act(() => {
      fireEvent.changeText(searchInput, 'Sharpy [V2]');
    });

    expect(getByText(/Clay Paky Sharpy/)).toBeTruthy();
    expect(queryByText(/Robe MegaPointe/)).toBeNull();
  });

  it('allows 1-tap selection of a suggestion', () => {
    const handleChangeText = jest.fn();
    const handleSelectSuggestion = jest.fn();
    const { getByTestId } = render(
      <CleaveModalInput
        label="SUPPLIER"
        value=""
        suggestions={mockSuggestions}
        getSuggestionLabel={(item) => item.name}
        getSuggestionKey={(item) => item.id}
        onChangeText={handleChangeText}
        onSelectSuggestion={handleSelectSuggestion}
        testID="cleave-supp"
        suggestionTestIDPrefix="supp-opt"
      />
    );

    act(() => {
      fireEvent.press(getByTestId('cleave-supp'));
    });

    const opt0 = getByTestId('supp-opt-0');
    act(() => {
      fireEvent.press(opt0);
    });

    expect(handleChangeText).toHaveBeenCalledWith('Robe MegaPointe (Lighting)');
    expect(handleSelectSuggestion).toHaveBeenCalledWith(mockSuggestions[0]);
  });

  it('allows accepting custom free-text entry when allowCustom is true', () => {
    const handleChangeText = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <CleaveModalInput
        label="SUPPLIER"
        value=""
        allowCustom={true}
        suggestions={mockSuggestions}
        getSuggestionLabel={(item) => item.name}
        onChangeText={handleChangeText}
        testID="cleave-custom"
        suggestionTestIDPrefix="custom-opt"
      />
    );

    act(() => {
      fireEvent.press(getByTestId('cleave-custom'));
    });

    const searchInput = getByTestId('cleave-custom-search-input');
    act(() => {
      fireEvent.changeText(searchInput, 'Brand New Audio Supplier Ltd');
    });

    const customBtn = getByTestId('custom-opt-custom');
    expect(customBtn).toBeTruthy();

    act(() => {
      fireEvent.press(customBtn);
    });

    expect(handleChangeText).toHaveBeenCalledWith('Brand New Audio Supplier Ltd');
    expect(queryByTestId('cleave-custom-modal')).toBeNull();
  });

  it('clears search input when tapping clear button', () => {
    const handleChangeText = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <CleaveModalInput
        label="CREW"
        value=""
        suggestions={mockSuggestions}
        getSuggestionLabel={(item) => item.name}
        onChangeText={handleChangeText}
        testID="cleave-crew"
      />
    );

    act(() => {
      fireEvent.press(getByTestId('cleave-crew'));
    });

    const searchInput = getByTestId('cleave-crew-search-input');
    act(() => {
      fireEvent.changeText(searchInput, 'Search Term');
    });

    const clearBtn = getByTestId('cleave-crew-clear-search-btn');
    expect(clearBtn).toBeTruthy();

    act(() => {
      fireEvent.press(clearBtn);
    });

    expect(queryByTestId('cleave-crew-clear-search-btn')).toBeNull();
  });

  it('closes modal when pressing close (X) button', () => {
    const handleChangeText = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <CleaveModalInput
        label="OWNER"
        value=""
        onChangeText={handleChangeText}
        testID="cleave-close"
      />
    );

    act(() => {
      fireEvent.press(getByTestId('cleave-close'));
    });

    expect(getByTestId('cleave-close-modal')).toBeTruthy();

    const closeBtn = getByTestId('cleave-close-modal-close');
    act(() => {
      fireEvent.press(closeBtn);
    });

    expect(queryByTestId('cleave-close-modal')).toBeNull();
  });

  it('handles null or undefined suggestions prop safely without throwing errors', () => {
    const handleChangeText = jest.fn();
    const { getByTestId, getByText } = render(
      <CleaveModalInput
        label="TEST"
        value=""
        suggestions={undefined as any}
        onChangeText={handleChangeText}
        testID="cleave-null-sugg"
      />
    );

    act(() => {
      fireEvent.press(getByTestId('cleave-null-sugg'));
    });

    const searchInput = getByTestId('cleave-null-sugg-search-input');
    act(() => {
      fireEvent.changeText(searchInput, 'Any query');
    });

    expect(getByText('Use "Any query"')).toBeTruthy();
  });

  it('handles complex regex characters (*, +, ?, ^, $, \\, ., {, }) in search highlight safely', () => {
    const handleChangeText = jest.fn();
    const complexSuggestions = [
      { id: '1', name: 'Regex *Special* (Test+1) [v2.0] {alpha}$' },
    ];
    const { getByTestId, getByText } = render(
      <CleaveModalInput
        label="EQUIPMENT"
        value=""
        suggestions={complexSuggestions}
        getSuggestionLabel={(item) => item.name}
        onChangeText={handleChangeText}
        testID="cleave-regex"
      />
    );

    act(() => {
      fireEvent.press(getByTestId('cleave-regex'));
    });

    const searchInput = getByTestId('cleave-regex-search-input');
    act(() => {
      fireEvent.changeText(searchInput, '*Special* (Test+1)');
    });

    expect(getByText(/Regex/)).toBeTruthy();
  });

  it('supports custom filterSuggestions function', () => {
    const handleChangeText = jest.fn();
    const customFilter = jest.fn((items: typeof mockSuggestions, query: string) =>
      items.filter((i: { name: string }) => i.name.toLowerCase().startsWith(query.toLowerCase()))
    );

    const { getByTestId, getByText, queryByText } = render(
      <CleaveModalInput
        label="EQUIPMENT"
        value=""
        suggestions={mockSuggestions}
        getSuggestionLabel={(item) => item.name}
        filterSuggestions={customFilter}
        onChangeText={handleChangeText}
        testID="cleave-custom-filter"
      />
    );

    act(() => {
      fireEvent.press(getByTestId('cleave-custom-filter'));
    });

    const searchInput = getByTestId('cleave-custom-filter-search-input');
    act(() => {
      fireEvent.changeText(searchInput, 'Robe');
    });

    expect(customFilter).toHaveBeenCalled();
    expect(getByText(/Robe MegaPointe/)).toBeTruthy();
    expect(queryByText(/Clay Paky/)).toBeNull();
  });

  it('handles suggestions array with null and undefined elements without crashing getSuggestionLabel', () => {
    const handleChangeText = jest.fn();
    const suggestionsWithNulls = [
      null,
      { id: '1', name: 'Valid Item 1', category: 'Lighting' },
      undefined,
      { id: '2', name: 'Valid Item 2', category: 'Audio' },
    ];

    const { getByTestId, getByText } = render(
      <CleaveModalInput
        label="EQUIPMENT"
        value=""
        suggestions={suggestionsWithNulls as any}
        getSuggestionLabel={(item) => item.name}
        getSuggestionBadge={(item) => item.category}
        onChangeText={handleChangeText}
        testID="cleave-nulls-array"
      />
    );

    act(() => {
      fireEvent.press(getByTestId('cleave-nulls-array'));
    });

    const searchInput = getByTestId('cleave-nulls-array-search-input');
    act(() => {
      fireEvent.changeText(searchInput, 'Valid');
    });

    expect(getByText('Valid Item 1')).toBeTruthy();
    expect(getByText('Valid Item 2')).toBeTruthy();
  });

  it('gracefully handles exceptions in getSuggestionSublabel and getSuggestionBadge callbacks', () => {
    const handleChangeText = jest.fn();
    const buggySuggestions = [{ id: '1', name: 'Faulty Item' }];

    const { getByTestId, getByText } = render(
      <CleaveModalInput
        label="EQUIPMENT"
        value=""
        suggestions={buggySuggestions}
        getSuggestionLabel={(item) => item.name}
        getSuggestionSublabel={(_item) => {
          throw new Error('Exploding sublabel');
        }}
        getSuggestionBadge={(_item) => {
          throw new Error('Exploding badge');
        }}
        onChangeText={handleChangeText}
        testID="cleave-exploding-callbacks"
      />
    );

    act(() => {
      fireEvent.press(getByTestId('cleave-exploding-callbacks'));
    });

    expect(getByText('Faulty Item')).toBeTruthy();
  });
});

