import "../../styles/treasurer/category-list.css";

function CategoryList({ revenueByCategory }) {
  return (
    <section className="categories">
      <h2>Revenue by Category</h2>
      {Object.keys(revenueByCategory).length === 0 ? (
        <p>No collections recorded yet.</p>
      ) : (
        <table className="category-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Paid</th>
              <th>Unpaid</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(revenueByCategory).map(([category, { paid, unpaid }]) => (
              <tr key={category}>
                <td><strong>{category}</strong></td>
                <td className="paid">₱{paid.toLocaleString()}</td>
                <td className="unpaid">₱{unpaid.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default CategoryList;
