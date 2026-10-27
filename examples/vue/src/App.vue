<script setup lang="ts">
import { computed, ref } from 'vue';

const products = [
  { id: 1, name: 'Seramik kupa', price: 250 },
  { id: 2, name: 'Noktalı defter', price: 500 },
];
const items = ref<Array<{ id: number; name: string; price: number }>>([]);
const total = computed(() => items.value.reduce((s, i) => s + i.price, 0));
</script>

<template>
  <main>
    <h1 data-testid="title">Flashback Vue</h1>
    <ul>
      <li v-for="p in products" :key="p.id">
        {{ p.name }} — {{ p.price }} ₺
        <button type="button" :data-testid="`add-${p.id}`" @click="items.push(p)">Ekle</button>
      </li>
    </ul>
    <p>Toplam: <strong data-testid="total">{{ total }} ₺</strong></p>
  </main>
</template>
