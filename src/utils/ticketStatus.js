// Function to manually check and update overdue tickets
export async function checkAndUpdateOverdueTickets() {
  try {
    // Call the PostgreSQL function to update overdue tickets
    const { data, error } = await supabase
      .rpc('update_overdue_tickets')

    if (error) {
      console.error('Error updating overdue tickets:', error)
      return { success: false, error: error.message }
    }

    console.log('✅ Overdue tickets updated successfully')
    return { success: true, data }
  } catch (error) {
    console.error('Unexpected error updating overdue tickets:', error)
    return { success: false, error: error.message }
  }
}

// Function to get count of overdue tickets
export async function getOverdueTicketsCount() {
  try {
    const { data, error } = await supabase
      .rpc('get_overdue_tickets_count')

    if (error) {
      console.error('Error getting overdue tickets count:', error)
      return { success: false, count: 0, error: error.message }
    }

    return { success: true, count: data || 0 }
  } catch (error) {
    console.error('Unexpected error getting overdue tickets count:', error)
    return { success: false, count: 0, error: error.message }
  }
}