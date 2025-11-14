"use client"

import React, { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface CustomColorPickerProps {
  isOpen: boolean
  onClose: () => void
  onApply: (color: string) => void
  initialColor?: string
  presetColors?: string[]
}

export function CustomColorPicker({
  isOpen,
  onClose,
  onApply,
  initialColor = '#3B82F6',
  presetColors = []
}: CustomColorPickerProps) {
  const [pickerHue, setPickerHue] = useState(210)
  const [pickerSaturation, setPickerSaturation] = useState(100)
  const [pickerLightness, setPickerLightness] = useState(50)
  const [hexInput, setHexInput] = useState('')
  const [isFromPreset, setIsFromPreset] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Validate hex color
  const isValidHexColor = (color: string): boolean => {
    return /^#[0-9A-Fa-f]{6}$/.test(color)
  }

  // Convert HSL to HEX
  const hslToHex = (h: number, s: number, l: number): string => {
    l /= 100
    const a = s * Math.min(l, 1 - l) / 100
    const f = (n: number) => {
      const k = (n + h / 30) % 12
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
      return Math.round(255 * color).toString(16).padStart(2, '0')
    }
    return `#${f(0)}${f(8)}${f(4)}`.toUpperCase()
  }

  // Convert HEX to HSL
  const hexToHsl = (hex: string): { h: number, s: number, l: number } => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    if (!result) return { h: 0, s: 0, l: 50 }

    let r = parseInt(result[1], 16) / 255
    let g = parseInt(result[2], 16) / 255
    let b = parseInt(result[3], 16) / 255

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    let h = 0, s = 0, l = (max + min) / 2

    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
        case g: h = ((b - r) / d + 2) / 6; break
        case b: h = ((r - g) / d + 4) / 6; break
      }
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      l: Math.round(l * 100)
    }
  }

  // Initialize picker when opened
  React.useEffect(() => {
    if (isOpen) {
      const normalizedInitialColor = initialColor.toUpperCase()
      const normalizedPresets = presetColors.map(c => c.toUpperCase())
      const isPreset = normalizedPresets.includes(normalizedInitialColor)

      if (!isPreset && isValidHexColor(initialColor)) {
        const hsl = hexToHsl(initialColor)
        setPickerHue(hsl.h)
        setPickerSaturation(hsl.s)
        setPickerLightness(hsl.l)
        setHexInput(initialColor)
        setIsFromPreset(false)
      } else {
        setPickerHue(0)
        setPickerSaturation(0)
        setPickerLightness(50)
        setHexInput('')
        setIsFromPreset(true)
      }
    }
  }, [isOpen, initialColor, presetColors])

  // Handle mouse up globally to stop dragging
  React.useEffect(() => {
    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      window.addEventListener('mouseup', handleMouseUp)
      return () => window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])


  const handleApply = () => {
    const hex = hslToHex(pickerHue, pickerSaturation, pickerLightness)
    onApply(hex)
    onClose()
  }

  const handleHexInputChange = (value: string) => {
    setHexInput(value)
    if (isValidHexColor(value)) {
      const hsl = hexToHsl(value)
      setPickerHue(hsl.h)
      setPickerSaturation(hsl.s)
      setPickerLightness(hsl.l)
      setIsFromPreset(false)
    }
  }

  const handleColorSheetInteraction = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const saturation = Math.round((x / rect.width) * 100)
    const lightness = Math.round(100 - (y / rect.height) * 100)
    setPickerSaturation(saturation)
    setPickerLightness(lightness)
    setIsFromPreset(false)
  }

  if (!isOpen) return null

  const currentHex = hslToHex(pickerHue, pickerSaturation, pickerLightness)

  const modalContent = (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Custom Color</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Color Picker Content */}
        <div className="space-y-6">
          {/* Current Color Preview */}
          {!isFromPreset && (
            <div className="flex items-center gap-4">
              <div
                className="w-20 h-20 rounded-xl border-2 border-gray-200 shadow-sm"
                style={{ backgroundColor: currentHex }}
              />
              <div>
                <Label className="text-sm font-medium text-gray-900">Selected Color</Label>
                <p className="text-2xl font-mono font-bold text-gray-700">{currentHex}</p>
              </div>
            </div>
          )}

          {/* Color Sheet - 2D Saturation/Lightness Picker */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Color Sheet</Label>
            <div
              className="relative w-full h-48 rounded-lg overflow-hidden cursor-crosshair border-2 border-gray-200"
              style={{
                background: `linear-gradient(to bottom, transparent, black), linear-gradient(to right, white, hsl(${pickerHue}, 100%, 50%))`
              }}
              onMouseDown={(e) => {
                setIsDragging(true)
                handleColorSheetInteraction(e)
              }}
              onMouseMove={(e) => {
                if (isDragging) {
                  handleColorSheetInteraction(e)
                }
              }}
              onClick={handleColorSheetInteraction}
            >
              {/* Cursor indicator */}
              <div
                className="absolute w-4 h-4 border-2 border-white rounded-full shadow-lg pointer-events-none"
                style={{
                  left: `calc(${pickerSaturation}% - 8px)`,
                  top: `calc(${100 - pickerLightness}% - 8px)`
                }}
              />
            </div>
          </div>

          {/* Hue Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-gray-700">Hue</Label>
              <span className="text-sm text-gray-500">{pickerHue}°</span>
            </div>
            <input
              type="range"
              min="0"
              max="360"
              value={pickerHue}
              onChange={(e) => {
                setPickerHue(Number(e.target.value))
                setIsFromPreset(false)
              }}
              className="w-full h-3 rounded-lg appearance-none cursor-pointer"
              style={{
                background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)'
              }}
            />
          </div>

          {/* Hex Input */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Hex Code</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-mono text-sm">#</span>
              <Input
                type="text"
                value={hexInput.replace('#', '')}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6);
                  handleHexInputChange('#' + value);
                }}
                placeholder="000000"
                className="auth-input pl-7 font-mono text-sm uppercase"
                maxLength={6}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleApply}
            className="flex-1 hover:opacity-90"
            style={{ backgroundColor: '#3e8692', color: 'white' }}
          >
            Apply Color
          </Button>
        </div>
    </div>
  )

  return modalContent
}
